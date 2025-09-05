import { CONFIG } from './config.js';
import { tetrominoTypeToIndex, CELL_SIZE, BOARD_WIDTH, BOARD_HEIGHT, ATTACK_BAR_WIDTH, HOLD_BOX_WIDTH, NEXT_BOX_WIDTH, ATTACK_BAR_GAP, HOLD_BOX_GAP, NEXT_BOX_GAP, TOTAL_WIDTH } from './draw.js';
import { showCountdown, showGameEndScreen } from './ui.js';
import { initializePieces, setGameState, gameState, triggerGameOver, setGameClear } from './game.js';
import { addAttackBar } from './garbage.js';

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

function setupMiniboardDimensions() {
    const screenHeight = window.innerHeight;
    const miniboardsPerColumn = 7;
    const numGaps = miniboardsPerColumn - 1;
    const fixedGap = 4; // pixels for the gap between miniboards

    // Calculate MINIBOARD_HEIGHT such that all miniboards + fixed gaps fit within screenHeight
    MINIBOARD_HEIGHT = ((screenHeight - (numGaps * fixedGap)) / miniboardsPerColumn) * 0.95;

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
            ctx: canvas.getContext('2d')
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

    const miniboardsPerRow = 7;
    const miniboardsPerColumn = 7;
    const totalMiniboardsPerSide = miniboardsPerRow * miniboardsPerColumn; // 49

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
    drawAllMiniBoards();
}

window.addEventListener('layout-changed', () => {
    setupMiniboardDimensions();
    setupMiniboardSlots();
    positionMiniboards();
});

export function connectToServer() {
    socket.connect();
}

function addOpponent(userId) {
    if (userId === socket.id) return;
    const existingSlot = miniboardSlots.find(slot => slot.userId === userId);
    if (existingSlot) return;
    const emptySlot = miniboardSlots.find(slot => slot.userId === null);
    if (emptySlot) {
        emptySlot.userId = userId;
        emptySlot.isGameOver = false;
        emptySlot.boardState.forEach(row => row.fill(0));
    }
}

function removeOpponent(userId) {
    const slot = miniboardSlots.find(slot => slot.userId === userId);
    if (slot) {
        slot.userId = null;
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
    drawMiniBoard(slot);
}

function drawMiniBoard(slot) {
    const { ctx, canvas, boardState, isGameOver, userId } = slot;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvas.style.display = 'block'; // Always display the canvas

    // If no user, draw an empty board
    if (userId === null) {
        ctx.fillStyle = 'rgba(0,0,0,0.1)'; // A lighter background for empty slots
        ctx.fillRect(0, 0, canvas.width, canvas.height);
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
        return;
    }

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
}

function drawAllMiniBoards() {
    miniboardSlots.forEach(drawMiniBoard);
}

let finalRanking = {}; // To store all player ranks

// --- Socket Event Handlers ---
socket.on("connect", () => {
    console.log("✅ サーバーに接続:", socket.id);
    miniboardSlots.forEach(slot => slot.userId = null);
    drawAllMiniBoards();
    finalRanking = {}; // Reset on new connection
});

export function startMatching() {
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
    drawAllMiniBoards();
});

socket.on("StartGame", () => {
    currentCountdown = null;
    showCountdown(null);
    initializePieces();
    setGameState('PLAYING');
    miniboardSlots.forEach(slot => slot.isGameOver = false);
    drawAllMiniBoards();
    finalRanking = {}; // Reset for new game
});

socket.on("ranking", ({ yourRankMap }) => {
  // If we already have a final rank, don't process further ranking events.
  if (finalRanking[socket.id]) return;

  // Merge new ranking info
  Object.assign(finalRanking, yourRankMap);

  // Update miniboards based on the comprehensive finalRanking map
  for (const userId in finalRanking) {
      const slot = miniboardSlots.find(s => s.userId === userId);
      if (slot && finalRanking[userId] !== null) {
          slot.isGameOver = true;
      }
  }
  drawAllMiniBoards();

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
    drawAllMiniBoards();
});

// --- Rest of the file is the same as before (sending data, error handling) ---

socket.on("CountDown", (count) => { currentCountdown = count; showCountdown(count); });
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

export let connectionError = false;
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
});
socket.on("reconnect_failed", () => {
    console.error("再接続に失敗しました");
    showConnectionError();
});
