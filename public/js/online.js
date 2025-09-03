import { CONFIG } from './config.js';
import { triggerGameOver, setGameClear, setGameState, initializePieces } from './game.js';
import { showGameEndScreen, showCountdown } from './ui.js';
import { addAttackBar } from './garbage.js';
import { tetrominoTypeToIndex, CELL_SIZE } from './draw.js';

export const socket = io(CONFIG.serverUrl, { 
    autoConnect: false,
    reconnection: true
});

export let currentCountdown = null;

// --- Opponent State Management ---
export const miniboardSlots = [];
const miniboardsContainer = document.getElementById('miniboards-container');

const MINIBOARD_CELL_SIZE = 6;
const MINIBOARD_WIDTH = CONFIG.board.cols * MINIBOARD_CELL_SIZE;
const MINIBOARD_HEIGHT = CONFIG.board.visibleRows * MINIBOARD_CELL_SIZE;
const MINIBOARD_GAP = 10;

function setupMiniboardSlots() {
    miniboardsContainer.innerHTML = '';
    miniboardSlots.length = 0;
    for (let i = 0; i < CONFIG.MAX_MINIBOARDS_PER_SIDE * 2; i++) {
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
    positionMiniboards();
}

function positionMiniboards() {
    const boardWidth = CONFIG.board.cols * CELL_SIZE;
    const boardHeight = CONFIG.board.visibleRows * CELL_SIZE;
    const attackBarWidth = 30;
    const attackBarGap = 20;
    const holdBoxWidth = 80;
    const holdBoxGap = 20;
    const nextBoxWidth = 80;
    const nextBoxGap = 20;
    const totalWidth = holdBoxWidth + holdBoxGap + attackBarWidth + attackBarGap + boardWidth + nextBoxGap + nextBoxWidth;

    const startX = (window.innerWidth - totalWidth) / 2;
    const startY = (window.innerHeight - boardHeight) / 2;

    const leftStartX = startX - MINIBOARD_GAP;
    const rightStartX = startX + totalWidth + MINIBOARD_GAP;

    let leftCount = 0;
    let rightCount = 0;
    const maxPerSide = 7;

    miniboardSlots.forEach((slot, i) => {
        if (i % 2 === 0) { // Left
            const row = Math.floor(leftCount / maxPerSide);
            const col = leftCount % maxPerSide;
            slot.canvas.style.left = `${leftStartX - MINIBOARD_WIDTH - (col * (MINIBOARD_WIDTH + MINIBOARD_GAP))}px`;
            slot.canvas.style.top = `${startY + (row * (MINIBOARD_HEIGHT + MINIBOARD_GAP))}px`;
            leftCount++;
        } else { // Right
            const row = Math.floor(rightCount / maxPerSide);
            const col = rightCount % maxPerSide;
            slot.canvas.style.left = `${rightStartX + (col * (MINIBOARD_WIDTH + MINIBOARD_GAP))}px`;
            slot.canvas.style.top = `${startY + (row * (MINIBOARD_HEIGHT + MINIBOARD_GAP))}px`;
            rightCount++;
        }
    });
}

window.addEventListener('layout-changed', positionMiniboards);

export function connectToServer() {
    socket.connect();
    setupMiniboardSlots();
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
    if (userId === null) {
        canvas.style.display = 'none';
        return;
    }
    canvas.style.display = 'block';

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

// --- Socket Event Handlers ---
socket.on("connect", () => {
    console.log("✅ サーバーに接続:", socket.id);
    miniboardSlots.forEach(slot => slot.userId = null);
    drawAllMiniBoards();
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
});

socket.on("ranking", ({ yourRankMap }) => {
  if (gameState !== 'PLAYING') return; // Ignore ranking if not in a game

  const myRank = yourRankMap[socket.id];
  if (myRank != null) {
    if (myRank !== 1) triggerGameOver();
    else { setGameClear(true); showGameEndScreen('You Win', true); }
  }
  for (const userId in yourRankMap) {
      const slot = miniboardSlots.find(s => s.userId === userId);
      if (slot && yourRankMap[userId] !== null) slot.isGameOver = true;
  }
  drawAllMiniBoards();
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