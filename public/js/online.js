import { CONFIG } from './config.js';
import { tetrominoTypeToIndex } from './draw.js';
import { MAIN_BOARD_CELL_SIZE, BOARD_WIDTH, BOARD_HEIGHT, ATTACK_BAR_WIDTH, HOLD_BOX_WIDTH, NEXT_BOX_WIDTH, ATTACK_BAR_GAP, HOLD_BOX_GAP, NEXT_BOX_GAP, TOTAL_WIDTH } from './layout.js';
import { showCountdown, showGameEndScreen, hideGameEndScreen } from './ui.js';
import { resetGame, setGameState, gameState, triggerGameOver, setGameClear, setHoldPiece, setNextPieces } from './game.js';
import { addAttackBar } from './garbage.js';
import { createLightOrb, triggerTargetAttackFlash, targetAttackFlashes, addTextEffect } from './effects.js';
import { drawUI } from './draw.js';

export const socket = io(CONFIG.serverUrl, {
    autoConnect: false,
    reconnection: true
});

export let playerTargets = new Map();

export let currentCountdown = null;

export let isManualDisconnect = false; // New flag for manual disconnect

// --- Callback for stats ---
let getStatsCallback = () => ({ score: 0, lines: 0, level: 1, time: '0.00', pps: 0, apm: 0 });

export function setOnlineGetStatsCallback(callback) {
    getStatsCallback = callback;
}

// --- Opponent State Management ---
export const miniboardSlots = [];
const leftMiniboardsGroup = document.getElementById('left-miniboards-group');
const rightMiniboardsGroup = document.getElementById('right-miniboards-group');

export let MINIBOARD_CELL_SIZE;
export let MINIBOARD_WIDTH;
export let MINIBOARD_HEIGHT;
export let MINIBOARD_GAP;

const MINIBOARDS_PER_COLUMN = 7;
const NUM_GAPS_PER_COLUMN = MINIBOARDS_PER_COLUMN - 1;

class MiniboardEntryEffect {
    constructor(ctx, width, height) {
        this.ctx = ctx;
        this.x = width / 2;
        this.y = height / 2;
        this.startTime = performance.now();
        this.lifeTime = 1500; // 1.5秒
        this.particles = [];
        this.particleCount = 30; // パーティクル数をさらに減らす
        this.active = true;

        // パーティクル初期化
        for (let i = 0; i < this.particleCount; i++) {
            this.particles.push({
                angle: Math.random() * Math.PI * 2,
                distance: Math.random() * 40 + 20,
                size: Math.random() * 2 + 1,
                speed: Math.random() * 0.02 + 0.01,
                phase: Math.random() * Math.PI * 2,
                opacity: 1
            });
        }
    }

    update(currentTime) {
        if (!this.active) return; // 既に非アクティブなら何もしない
        
        const elapsed = currentTime - this.startTime;
        const progress = Math.min(1, elapsed / this.lifeTime);

        // 終了チェック
        if (progress >= 1) {
            this.active = false;
            return;
        }

        // パーティクル更新
        this.particles.forEach(particle => {
            particle.phase += particle.speed;
            particle.currentDistance = particle.distance * (0.3 + 0.7 * Math.sin(progress * Math.PI));
        });
    }

    draw(currentTime) {
        if (!this.active) return;

        const elapsed = currentTime - this.startTime;
        const progress = Math.min(1, elapsed / this.lifeTime);
        const time = elapsed * 0.001;

        // 中心の光
        const centerSize = 8 + Math.sin(time * 10) * 3;
        const centerAlpha = 0.7 * (1 - progress * 0.5);
        this.ctx.beginPath();
        this.ctx.arc(this.x, this.y, centerSize, 0, Math.PI * 2);
        this.ctx.fillStyle = `rgba(255, 255, 255, ${centerAlpha})`;
        this.ctx.fill();

        // DEBUG: Draw a crosshair at the effect's perceived center
        this.ctx.strokeStyle = 'red';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(this.x - 5, this.y);
        this.ctx.lineTo(this.x + 5, this.y);
        this.ctx.moveTo(this.x, this.y - 5);
        this.ctx.lineTo(this.x, this.y + 5);
        this.ctx.stroke();

        // パーティクル描画
        this.particles.forEach((particle, index) => {
            const angle = particle.angle + particle.phase;
            const distance = particle.currentDistance || particle.distance;
            const px = this.x + Math.cos(angle) * distance;
            const py = this.y + Math.sin(angle) * distance;

            // 透明度調整
            const particleAlpha = particle.opacity * (0.7 + 0.3 * Math.sin(time * 5 + index));
            const fadeAlpha = particleAlpha * (1 - progress * 0.8);

            this.ctx.beginPath();
            this.ctx.arc(px, py, particle.size, 0, Math.PI * 2);
            this.ctx.fillStyle = `rgba(0, 200, 255, ${fadeAlpha})`;
            this.ctx.fill();
        });
    }

    isActive() {
        return this.active;
    }
}

function setupMiniboardDimensions() {
    MINIBOARD_CELL_SIZE = 3.5; // Keep this for canvas drawing dimensions
    MINIBOARD_HEIGHT = CONFIG.board.visibleRows * MINIBOARD_CELL_SIZE; // e.g. 20 * 3.5 = 70
    MINIBOARD_WIDTH = CONFIG.board.cols * MINIBOARD_CELL_SIZE; // e.g. 10 * 3.5 = 35
}

// Call dimensions setup once on load.
setupMiniboardDimensions();

function setupMiniboardSlots() {
    leftMiniboardsGroup.innerHTML = '';
    rightMiniboardsGroup.innerHTML = '';
    miniboardSlots.length = 0;
    const totalMiniboards = 98;
    for (let i = 0; i < totalMiniboards; i++) {
        const canvas = document.createElement('canvas');
        canvas.width = MINIBOARD_WIDTH;
        canvas.height = MINIBOARD_HEIGHT;
        canvas.className = 'miniboard';
        
        if (i < 49) {
            leftMiniboardsGroup.appendChild(canvas);
        } else {
            rightMiniboardsGroup.appendChild(canvas);
        }

        const slot = {
            userId: null,
            boardState: Array.from({ length: CONFIG.board.rows }, () => Array(CONFIG.board.cols).fill(0)),
            isGameOver: false,
            canvas: canvas,
            ctx: canvas.getContext('2d'),
            isNew: false,
            effect: null,
            dirty: true
        };

        canvas.addEventListener('click', () => {
            if (slot.userId && gameState === 'PLAYING') {
                setTarget(slot.userId);
            }
        });

        miniboardSlots.push(slot);
    }
}

// Setup slots on initial load
window.addEventListener('load', setupMiniboardSlots);

export function connectToServer() {
    socket.connect();
}

function addOpponent(userId) {
    if (userId === socket.id) return;
    const existingSlot = miniboardSlots.find(slot => slot.userId === userId);
    if (existingSlot) return;

    // Find all empty slots
    const emptySlots = miniboardSlots.filter(slot => slot.userId === null);

    if (emptySlots.length > 0) {
        // Pick a random empty slot
        const randomIndex = Math.floor(Math.random() * emptySlots.length);
        const emptySlot = emptySlots[randomIndex];

        emptySlot.userId = userId;
        emptySlot.isGameOver = false;
        emptySlot.boardState.forEach(row => row.fill(0));
        emptySlot.isNew = true; // Add this flag for the effect
        emptySlot.dirty = true;

        // Only start the effect if the game is not yet playing
        if (gameState !== 'PLAYING') { // Check gameState here
            emptySlot.effect = new MiniboardEntryEffect(emptySlot.ctx, emptySlot.canvas.width, emptySlot.canvas.height);
        }
        startAnimationIfNeeded();
    }
}

function removeOpponent(userId) {
    const slot = miniboardSlots.find(slot => slot.userId === userId);
    if (slot) {
        slot.userId = null;
        slot.dirty = true;
        startAnimationIfNeeded();
    }
}

function updateSlotBoard(slot, boardData, diffData) {
    if (boardData) {
        slot.boardState = boardData;
    } else if (diffData) {
        diffData.forEach(({ r, c, val }) => {
            if (slot.boardState[r]) slot.boardState[r][c] = val;
        });
    }
    slot.dirty = true;
    startAnimationIfNeeded();
}

function drawMiniBoard(slot, currentTime) {
    const { ctx, canvas, boardState, isGameOver, userId, effect } = slot;
    if (!slot.dirty && !(effect && effect.isActive())) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvas.style.display = 'block';

    // If no user, draw an empty board
    if (userId === null) {
        ctx.fillStyle = 'rgba(0,0,0,0.1)'; // A lighter background for empty slots
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        // If there was an effect, clear it
        if (effect) slot.effect = null;
        slot.dirty = false;
        return;
    }

    if (userId !== socket.id) { // Only for opponent miniboards

    }

    if (isGameOver) {
        console.log(`drawMiniBoard: Miniboard for ${userId} is Game Over. Attempting to draw "KO".`);
        // Temporary debug: Draw a red background to confirm drawing is happening
        // ctx.fillStyle = 'red';
        // ctx.fillRect(0, 0, canvas.width, canvas.height);

        // ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
        // ctx.fillRect(0, 0, canvas.width, canvas.height);
        // ctx.fillStyle = 'white';
        // ctx.font = `bold ${canvas.width / 4}px Exo 2`;
        // ctx.textAlign = "center";
        // ctx.textBaseline = "middle";
        // ctx.fillText("KO", canvas.width / 2, canvas.height / 2);

        // Get the center position of the mini-board relative to the main game canvas
        const koPos = getBoardCenterPosition(userId);
        if (koPos) {
            addTextEffect('KO', { style: 'ko', duration: 1500, x: koPos.x, y: koPos.y });
        }

        // If there was an effect, clear it
        if (effect) slot.effect = null;
        // Do NOT set slot.dirty = false here, as we want the KO to persist
        return;
    }

    // Draw the actual miniboard content
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const startRow = CONFIG.board.rows - CONFIG.board.visibleRows;
    for (let r = 0; r < CONFIG.board.visibleRows; r++) {
        for (let c = 0; c < CONFIG.board.cols; c++) {
            const block = boardState[startRow + r]?.[c];
            if (block !== 0) {
                const typeIndex = tetrominoTypeToIndex(block);
                ctx.fillStyle = block === 'G' ? '#555' : (CONFIG.colors.tetromino[typeIndex + 1] || "#808080");
                ctx.fillRect(
                    c * MINIBOARD_CELL_SIZE,
                    r * MINIBOARD_CELL_SIZE,
                    MINIBOARD_CELL_SIZE,
                    MINIBOARD_CELL_SIZE
                );
            }
        }
    }

    // Update and draw the effect if active
    if (effect && effect.isActive()) {
        effect.update(currentTime);
        effect.draw(currentTime);
    } else if (effect && !effect.isActive()) {
        slot.effect = null; // Clean up inactive effect
    }
    slot.dirty = false;
}

let animationFrameId = null;

function drawAllMiniBoards() {
    const currentTime = performance.now();
    miniboardSlots.forEach(slot => drawMiniBoard(slot, currentTime));
    
    // アニメーションが必要なエフェクトがあるかチェック
    const hasActiveEffects = miniboardSlots.some(slot => slot.effect && slot.effect.isActive());
    
    // アクティブなエフェクトがある場合のみ次のフレームを要求
    if (hasActiveEffects) {
        animationFrameId = requestAnimationFrame(drawAllMiniBoards);
    } else {
        animationFrameId = null;
    }
}

function startAnimationIfNeeded() {
    if (!animationFrameId) {
        animationFrameId = requestAnimationFrame(drawAllMiniBoards);
    }
}



let finalRanking = {}; // To store all player ranks
let currentRoomId = null; // To store the current room ID

export function drawTargetLines(ctx) {
    if (!ctx) {
        console.log("drawTargetLines: context is null");
        return;
    }
    if (!socket.id) {
        console.log("drawTargetLines: socket.id is null");
        return;
    }

    const myId = socket.id;
    const myPos = getBoardCenterPosition(myId);
    if (!myPos) {
        console.log("drawTargetLines: myPos is null, cannot draw lines.");
        return;
    }
    console.log(`drawTargetLines: myPos = ${JSON.stringify(myPos)}`);

    const now = performance.now();

    for (const [attackerId, targetId] of playerTargets.entries()) {
        // Draw lines from attackers to me
        if (targetId === myId) {
            const attackerPos = getBoardCenterPosition(attackerId);
            if (attackerPos) {
                console.log(`drawTargetLines: Drawing line from attacker ${attackerId} at ${JSON.stringify(attackerPos)} to me at ${JSON.stringify(myPos)}`);
                ctx.beginPath();
                ctx.moveTo(attackerPos.x, attackerPos.y);
                ctx.lineTo(myPos.x, myPos.y);
                ctx.strokeStyle = 'rgba(255, 255, 102, 0.7)'; // Yellowish
                ctx.lineWidth = 1;
                ctx.stroke();
            } else {
                console.log(`drawTargetLines: Attacker ${attackerId} pos is null, cannot draw line to me.`);
            }
        }

        // Draw line from me to my target
        if (attackerId === myId && targetId) {
            const targetPos = getBoardCenterPosition(targetId);
            if (targetPos) {
                console.log(`drawTargetLines: Drawing line from me to target ${targetId} at ${JSON.stringify(targetPos)}`);
                const isFlashing = targetAttackFlashes.has(myId) && now < targetAttackFlashes.get(myId);

                ctx.beginPath();
                ctx.moveTo(myPos.x, myPos.y);
                ctx.lineTo(targetPos.x, targetPos.y);
                ctx.strokeStyle = isFlashing ? '#FFFFFF' : '#FFFF66';
                ctx.lineWidth = isFlashing ? 3 : 1.5;
                ctx.shadowColor = isFlashing ? '#FFFFFF' : '#FFFF66';
                ctx.shadowBlur = 10;
                ctx.stroke();
                ctx.shadowBlur = 0; // Reset shadow blur
            } else {
                console.log(`drawTargetLines: Target ${targetId} pos is null, cannot draw line from me.`);
            }
        }
    }
}

// --- Attack Effect Helpers ---
export function getBoardCenterPosition(userId, clearedLines = null) {
    const mainGameCanvas = document.getElementById('main-game-board');
    if (!mainGameCanvas) return null;
    const mainGameCanvasRect = mainGameCanvas.getBoundingClientRect();

    let targetRect;

    if (userId === socket.id) {
        const mainBoard = document.getElementById('main-game-board');
        if (!mainBoard) return null;
        targetRect = mainBoard.getBoundingClientRect();
    } else {
        const slot = miniboardSlots.find(s => s.userId === userId);
        if (slot && slot.canvas) {
            targetRect = slot.canvas.getBoundingClientRect();
        }
    }

    if (targetRect) {
        const finalX = targetRect.left - mainGameCanvasRect.left + targetRect.width / 2;
        const finalY = targetRect.top - mainGameCanvasRect.top + targetRect.height / 2;
        console.log(`getBoardCenterPosition for ${userId}: targetRect=${JSON.stringify(targetRect)}, mainGameCanvasRect=${JSON.stringify(mainGameCanvasRect)}, finalX=${finalX}, finalY=${finalY}`);
        return {
            x: finalX,
            y: finalY
        };
    }

    return null;
}

function getAttackBarPosition() {
    const mainGameCanvas = document.getElementById('main-game-board');
    if (!mainGameCanvas) return null;
    const mainGameCanvasRect = mainGameCanvas.getBoundingClientRect();

    const attackBar = document.getElementById('attack-bar');
    if (!attackBar) return null;

    const attackBarRect = attackBar.getBoundingClientRect();
    
    return {
        x: attackBarRect.left - mainGameCanvasRect.left + attackBarRect.width / 2,
        y: attackBarRect.top - mainGameCanvasRect.top + attackBarRect.height / 2 
    };
}

// --- Socket Event Handlers ---
socket.on("connect", () => {
    console.log("✅ サーバーに接続:", socket.id);
    miniboardSlots.forEach(slot => {
        slot.userId = null;
        slot.dirty = true;
    });
    startAnimationIfNeeded();
    finalRanking = {}; // Reset on new connection
    setGameState('LOBBY'); // Ensure client is in lobby state on connect
});

export function startMatching() {
    miniboardSlots.forEach(slot => {
        slot.userId = null;
        slot.dirty = true;
    }); // Clear miniboards
    startAnimationIfNeeded(); // Redraw to show them empty
    socket.emit("matching");
}

socket.on('targetsUpdate', (targets) => {
    playerTargets = new Map(targets);
    // We need to redraw the miniboards to update their target styles
    miniboardSlots.forEach(slot => slot.dirty = true);
    startAnimationIfNeeded();
});

socket.on("roomInfo", (data) => {
    currentRoomId = data.roomId; // Store the current room ID
    const currentOpponents = new Set(miniboardSlots.filter(s => s.userId).map(s => s.userId));
    const newOpponentIds = new Set(data.members.filter(id => id !== socket.id));

    // Add new opponents
    newOpponentIds.forEach(id => {
        if (!currentOpponents.has(id)) addOpponent(id);
    });

    // Remove disconnected opponents
    currentOpponents.forEach(id => {
        if (!newOpponentIds.has(id)) removeOpponent(id);
    });
});

socket.on("StartGame", () => {
    currentCountdown = null;
    showCountdown(null);
    hideGameEndScreen(); // Hide end screen
    resetGame(); // Changed to resetGame()
    setHoldPiece(null); // Moved from CountDown
    drawUI();           // Moved from CountDown
    setGameState('PLAYING');
    miniboardSlots.forEach(slot => {
        if (slot.userId) { // Only reset boards for active opponents
            slot.isGameOver = false;
            slot.boardState.forEach(row => row.fill(0)); // Clear the board state
            slot.dirty = true;
        }
    });
    startAnimationIfNeeded();
    finalRanking = {}; // Reset for new game
    lastSentBoard = null; // Ensure board history is cleared for the new game
});

socket.on("ranking", ({ yourRankMap, statsMap, roomId }) => {
  if (roomId !== currentRoomId) {
      console.log(`Ignoring ranking update from old room: ${roomId}`);
      return;
  }
  
  console.log(`[Ranking] Received ranking update for room ${roomId}. yourRankMap:`, yourRankMap);

  // Merge new ranking info
  Object.assign(finalRanking, yourRankMap);

  // Ensure all active players are in finalRanking with null if their rank is not yet determined
  miniboardSlots.forEach(slot => {
      if (slot.userId && !finalRanking.hasOwnProperty(slot.userId)) {
          finalRanking[slot.userId] = null; // Mark as active/undetermined rank
      }
      if (slot.userId && finalRanking.hasOwnProperty(slot.userId) && finalRanking[slot.userId] !== null && !slot.isGameOver) {
          console.log(`[Ranking] Setting isGameOver=true for userId: ${slot.userId}, rank: ${finalRanking[slot.userId]}`);
          slot.isGameOver = true;
          slot.dirty = true;
      }
  });

  // Update miniboards based on the comprehensive finalRanking map
  for (const userId in finalRanking) {
      const slot = miniboardSlots.find(s => s.userId === userId);
      if (slot && finalRanking[userId] !== null) {
          slot.isGameOver = true;
          slot.dirty = true;
      }
  }
  startAnimationIfNeeded();

  const myRank = finalRanking[socket.id];

  // If my rank is now determined, my game is over.
  if (myRank !== null && myRank !== undefined) {
      const isWin = myRank === 1;
      const title = isWin ? 'You Win!' : 'Game Over';
      if (isWin) {
        setGameClear(true); // Sets state to GAME_OVER
      } else {
        setGameState('GAME_OVER');
      }
      showGameEndScreen(title, isWin, finalRanking, socket.id, statsMap || { [socket.id]: getStatsCallback() });
      return;
  }
});

socket.on("BoardStatus", (data) => {
    if (gameState !== 'PLAYING') return; // Ignore if not in a game
    const { UserID, board, diff } = data;
    let slot = miniboardSlots.find(s => s.userId === UserID);
    if (!slot) {
        addOpponent(UserID);
        slot = miniboardSlots.find(s => s.userId === UserID);
    }
    if (slot) updateSlotBoard(slot, board, diff);
});

socket.on("BoardStatusBulk", (boards) => {
    if (gameState !== 'PLAYING') return; // Ignore if not in a game
    for (const userId in boards) {
        const boardData = boards[userId];
        if (!boardData) continue;
        let slot = miniboardSlots.find(s => s.userId === userId);
        if (!slot) {
            addOpponent(userId);
            slot = miniboardSlots.find(s => s.userId === userId);
        }
        if (slot) updateSlotBoard(slot, boardData.board, boardData.diff);
    }
});

socket.on("PlayerDisconnected", ({ userId }) => {
    removeOpponent(userId);
});

// --- Rest of the file is the same as before (sending data, error handling) ---

socket.on("CountDown", (count) => {
    currentCountdown = count;
    showCountdown(count);
});

socket.on("ReceiveGarbage", ({ from, lines }) => {
    addAttackBar(lines); 
    
    console.log(`ReceiveGarbage from: ${from}, lines: ${lines}`);
    let attackerPos;
    if (from) {
        attackerPos = getBoardCenterPosition(from);
    } else {
        // ターゲットがいない場合は、画面上部中央へ
        attackerPos = { x: BOARD_WIDTH / 2, y: 0 };
    }

    const myAttackBarPos = getAttackBarPosition();
    console.log('Attacker Pos:', attackerPos, 'Main Board Center:', { x: BOARD_WIDTH / 2, y: BOARD_HEIGHT / 2 });
    createLightOrb(attackerPos, { x: BOARD_WIDTH / 2, y: BOARD_HEIGHT / 2 });
});

let lastSentBoard = null;
function getBoardWithCurrentPiece(board, currentPiece) {
    const boardCopy = board.map(row => row.slice());
    if (currentPiece) {
        const shape = currentPiece.shape[currentPiece.rotation];
        shape.forEach(([dx, dy]) => {
            const x = currentPiece.x + dx;
            const y = currentPiece.y + dy;
            if (y >= 0 && y < boardCopy.length && x >= 0 && x < boardCopy[0].length) {
                boardCopy[y][x] = currentPiece.type;
            }
        });
    }
    return boardCopy;
}
function getBoardDiff(oldBoard, newBoard) {
    if (!oldBoard) return null;
    const diff = [];
    for (let r = 0; r < newBoard.length; r++) {
        for (let c = 0; c < newBoard[r].length; c++) {
            if (oldBoard[r][c] !== newBoard[r][c]) {
                diff.push({ r, c, val: newBoard[r][c] });
            }
        }
    }
    return diff.length > 0 ? diff : null;
}
export function sendBoardStatus(board, currentPiece) {
    if (!socket.connected) return;
    const currentBoardState = getBoardWithCurrentPiece(board, currentPiece);
    const diff = getBoardDiff(lastSentBoard, currentBoardState);
    if (diff) {
        socket.emit("BoardStatus", { diff });
        lastSentBoard = currentBoardState;
    } else if (!lastSentBoard) {
        socket.emit("BoardStatus", { board: currentBoardState });
        lastSentBoard = currentBoardState;
    }
}

function sendGarbage(targetId, lines) {
    if (!socket.connected || lines <= 0) return;
    socket.emit("SendGarbage", { targetId, lines });
}

export function setTarget(targetId) {
    if (!socket.connected) return;
    socket.emit('setTarget', targetId);
}

export function sendAttack(targetId, lines, clearedLines = null) {
    sendGarbage(targetId, lines);

    // Trigger the flash effect for the target line
    if (targetId) {
        triggerTargetAttackFlash(socket.id);
    }

    console.log(`sendAttack to: ${targetId}, lines: ${lines}, clearedLines:`, clearedLines);
    const myPos = getBoardCenterPosition(socket.id, clearedLines);
    let targetPos;

    if (targetId) {
        targetPos = getBoardCenterPosition(targetId);
    } else {
        // ターゲットがいない場合は、画面上部中央へ
        const effectCanvasElement = document.getElementById('effect-canvas');
        if (effectCanvasElement) {
            const effectCanvasRect = effectCanvasElement.getBoundingClientRect();
            targetPos = { x: effectCanvasRect.width / 2, y: 0 };
        }
    }
    
    console.log('My Pos:', myPos, 'Main Board Center:', { x: BOARD_WIDTH / 2, y: BOARD_HEIGHT / 2 });
    createLightOrb(myPos, targetPos);
}

let connectionError = false;
const errorOverlay = document.createElement('div');
errorOverlay.style.position = 'fixed';
errorOverlay.style.top = '0';
errorOverlay.style.left = '0';
errorOverlay.style.width = '100%';
errorOverlay.style.height = '100%';
errorOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
errorOverlay.style.color = 'white';
errorOverlay.style.display = 'none';
errorOverlay.style.justifyContent = 'center';
errorOverlay.style.alignItems = 'center';
errorOverlay.style.zIndex = '999';
errorOverlay.style.fontSize = '1.5rem';
errorOverlay.innerHTML = 'サーバーとの接続が切れました。再接続を試みています... <br>ページをリロードする必要があるかもしれません。';
document.body.appendChild(errorOverlay);
function showConnectionError() {
    connectionError = true;
    errorOverlay.style.display = 'flex';
}
function hideConnectionError() {
    connectionError = false;
    errorOverlay.style.display = 'none';
}
socket.on("disconnect", (reason) => {
    console.log(`❌ サーバーから切断されました: ${reason}`);
    showConnectionError();
});
socket.on("connect_error", (err) => {
    console.error(`接続エラー: ${err.message}`);
    showConnectionError();
});
socket.on("reconnect", () => {
    console.log("✅ サーバーに再接続しました");
    hideConnectionError();
    socket.emit('requestRoomInfo');
    setGameState('LOBBY'); // Ensure client is in lobby state on reconnect
});
socket.on("reconnect_failed", () => {
    console.error("再接続に失敗しました");
    showConnectionError();
});

export { connectionError, startAnimationIfNeeded };