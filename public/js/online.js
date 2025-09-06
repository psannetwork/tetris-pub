import { CONFIG } from './config.js';
import { tetrominoTypeToIndex, CELL_SIZE, BOARD_WIDTH, BOARD_HEIGHT, ATTACK_BAR_WIDTH, HOLD_BOX_WIDTH, NEXT_BOX_WIDTH, ATTACK_BAR_GAP, HOLD_BOX_GAP, NEXT_BOX_GAP, TOTAL_WIDTH } from './draw.js';
import { showCountdown, showGameEndScreen } from './ui.js';
import { resetGame, setGameState, gameState, triggerGameOver, setGameClear, setHoldPiece, setNextPieces } from './game.js';
import { addAttackBar } from './garbage.js';
import { drawUI } from './draw.js';

export const socket = io(CONFIG.serverUrl, {
    autoConnect: false,
    reconnection: true
});

export let currentCountdown = null;

// --- Opponent State Management ---
export const miniboardSlots = [];
const miniboardsContainer = document.getElementById('miniboards-container');

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
    const screenHeight = window.innerHeight;
    const fixedGap = 4; // pixels for the gap between miniboards
    const verticalPadding = 20; // pixels for top and bottom padding

    // Calculate available height for miniboards and gaps
    const availableHeight = screenHeight - (2 * verticalPadding);

    // Calculate MINIBOARD_HEIGHT such that all miniboards + fixed gaps fit within availableHeight
    MINIBOARD_HEIGHT = (availableHeight - (NUM_GAPS_PER_COLUMN * fixedGap)) / MINIBOARDS_PER_COLUMN;

    // Ensure a minimum size for MINIBOARD_HEIGHT
    MINIBOARD_HEIGHT = Math.max(MINIBOARD_HEIGHT, CONFIG.board.visibleRows * 4); // Minimum height for 4px cell size

    // Calculate MINIBOARD_CELL_SIZE based on the new MINIBOARD_HEIGHT
    MINIBOARD_CELL_SIZE = MINIBOARD_HEIGHT / CONFIG.board.visibleRows;

    // Ensure a minimum size for MINIBOARD_CELL_SIZE
    MINIBOARD_CELL_SIZE = Math.max(MINIBOARD_CELL_SIZE, 4); // Minimum 4px cell size

    // Recalculate MINIBOARD_HEIGHT based on the final MINIBOARD_CELL_SIZE to ensure integer values
    MINIBOARD_HEIGHT = CONFIG.board.visibleRows * MINIBOARD_CELL_SIZE;

    MINIBOARD_GAP = fixedGap; // Use the fixed gap

    MINIBOARD_WIDTH = CONFIG.board.cols * MINIBOARD_CELL_SIZE;
}

function setupMiniboardSlots() {
    miniboardsContainer.innerHTML = '';
    miniboardSlots.length = 0;
    const totalMiniboards = 98; // 49 per side for a 7x7 grid
    for (let i = 0; i < totalMiniboards; i++) {
        const canvas = document.createElement('canvas');
        canvas.width = MINIBOARD_WIDTH;
        canvas.height = MINIBOARD_HEIGHT;
        canvas.className = 'miniboard';
        miniboardsContainer.appendChild(canvas);

        miniboardSlots.push({
            userId: null,
            boardState: Array.from({ length: CONFIG.board.rows }, () => Array(CONFIG.board.cols).fill(0)),
            isGameOver: false,
            canvas: canvas,
            ctx: canvas.getContext('2d'),
            isNew: false,
            effect: null, // Add this property
            dirty: true
        });
    }
}

function positionMiniboards() {
    // No explicit topMargin needed if we calculate MINIBOARD_HEIGHT to fill the screen
    const topMargin = -(MINIBOARD_HEIGHT * 1.25 + MINIBOARD_GAP);

    // Get the actual positions of the side panels from the DOM.
    const leftPanel = document.querySelector('.game-panel-left');
    const rightPanel = document.querySelector('.game-panel-right');

    if (!leftPanel || !rightPanel) {
        console.error("Game panels not found for miniboard positioning.");
        return;
    }

    const leftRect = leftPanel.getBoundingClientRect();
    const rightRect = rightPanel.getBoundingClientRect();
    const containerRect = document.getElementById('game-container').getBoundingClientRect();

    // Calculate positions relative to the game-container.
    const gameAreaLeft = leftRect.left - containerRect.left;
    const gameAreaRight = rightRect.right - containerRect.left;

    const miniboardsPerRow = MINIBOARDS_PER_COLUMN;
    const totalMiniboardsPerSide = miniboardsPerRow * MINIBOARDS_PER_COLUMN; // 49

    const leftGridWidth = miniboardsPerRow * MINIBOARD_WIDTH + (miniboardsPerRow - 1) * MINIBOARD_GAP;

    // Position grids relative to the actual game area bounds.
    const leftGridStartX = gameAreaLeft - MINIBOARD_GAP - leftGridWidth;
    const rightGridStartX = gameAreaRight + MINIBOARD_GAP;

    let leftCount = 0;
    let rightCount = 0;

    miniboardSlots.forEach((slot, i) => {
        if (i < totalMiniboardsPerSide) { // Left side: 0-48
            const row = Math.floor(leftCount / miniboardsPerRow);
            const col = leftCount % miniboardsPerRow;
            slot.canvas.style.left = `${leftGridStartX + (col * (MINIBOARD_WIDTH + MINIBOARD_GAP))}px`;
            slot.canvas.style.top = `${topMargin + (row * (MINIBOARD_HEIGHT + MINIBOARD_GAP))}px`;
            leftCount++;
        } else if (i < totalMiniboardsPerSide * 2) { // Right side: 49-97
            const row = Math.floor(rightCount / miniboardsPerRow);
            const col = rightCount % miniboardsPerRow;
            slot.canvas.style.left = `${rightGridStartX + (col * (MINIBOARD_WIDTH + MINIBOARD_GAP))}px`;
            slot.canvas.style.top = `${topMargin + (row * (MINIBOARD_HEIGHT + MINIBOARD_GAP))}px`;
            rightCount++;
        } else {
            slot.canvas.style.display = 'none';
        }
    });
}

window.addEventListener('layout-changed', () => {
    setupMiniboardDimensions();
    setupMiniboardSlots();
    positionMiniboards();
    // 必要に応じてアニメーションを開始
    startAnimationIfNeeded();
});

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

    if (isGameOver) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'white';
        ctx.font = `bold ${canvas.width / 4}px Exo 2`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("KO", canvas.width / 2, canvas.height / 2);
        // If there was an effect, clear it
        if (effect) slot.effect = null;
        slot.dirty = false;
        return;
    }

    // Draw the actual miniboard content
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const startRow = CONFIG.board.rows - CONFIG.board.visibleRows;
    for (let r = 0; r < CONFIG.board.visibleRows; r++) {
        for (let c = 0; c < CONFIG.board.cols; c++) {
            const block = boardState[startRow + r][c];
            if (block !== 0) {
                const typeIndex = tetrominoTypeToIndex(block);
                ctx.fillStyle = block === 'G' ? '#555' : (CONFIG.colors.tetromino[typeIndex + 1] || "#808080");
                ctx.fillRect(c * MINIBOARD_CELL_SIZE, r * MINIBOARD_CELL_SIZE, MINIBOARD_CELL_SIZE, MINIBOARD_CELL_SIZE);
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

// アニメーションを開始する関数
function startAnimationIfNeeded() {
    if (!animationFrameId) {
        animationFrameId = requestAnimationFrame(drawAllMiniBoards);
    }
}

// exportされたdrawAllMiniBoardsを削除し、代わりに以下を追加
export { drawAllMiniBoards as drawAllMiniBoardsInternal }; // 内部用

let finalRanking = {}; // To store all player ranks

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

socket.on("roomInfo", (data) => {
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
    resetGame(); // Changed to resetGame()
    setGameState('PLAYING');
    miniboardSlots.forEach(slot => {
        slot.isGameOver = false;
        slot.dirty = true;
    });
    startAnimationIfNeeded();
    finalRanking = {}; // Reset for new game
});

socket.on("ranking", ({ yourRankMap }) => {
  

  // Merge new ranking info
  Object.assign(finalRanking, yourRankMap);

  // Ensure all active players are in finalRanking with null if their rank is not yet determined
  miniboardSlots.forEach(slot => {
      if (slot.userId && !finalRanking.hasOwnProperty(slot.userId)) {
          finalRanking[slot.userId] = null; // Mark as active/undetermined rank
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
      showGameEndScreen(title, isWin, finalRanking, socket.id);
      return;
  }

  // Client-side win detection (last person standing)
  const opponents = miniboardSlots.filter(s => s.userId && s.userId !== socket.id);
  const activeOpponents = opponents.filter(s => {
      // An opponent is active if they are NOT in the final ranking map
      return !finalRanking[s.userId];
  });

  if (opponents.length > 0 && activeOpponents.length === 0) {
      finalRanking[socket.id] = 1; // I am the winner
      setGameClear(true); // This also sets gameState to GAME_OVER
      showGameEndScreen('You Win!', true, finalRanking, socket.id);
  }
});

socket.on("BoardStatus", (data) => {
    const { UserID, board, diff } = data;
    let slot = miniboardSlots.find(s => s.userId === UserID);
    if (!slot) {
        addOpponent(UserID);
        slot = miniboardSlots.find(s => s.userId === UserID);
    }
    if (slot) updateSlotBoard(slot, board, diff);
});

socket.on("BoardStatusBulk", (boards) => {
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
    if (count === 5) { // Assuming 5 is the start of the countdown
        setHoldPiece(null);
        setNextPieces([]);
        drawUI(); // Update the UI to reflect empty Next/Hold
    }
});
socket.on("ReceiveGarbage", ({ from, lines }) => { addAttackBar(lines); });

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
export function sendGarbage(targetId, lines) {
    if (!socket.connected || lines <= 0) return;
    socket.emit("SendGarbage", { targetId, lines });
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