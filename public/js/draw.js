import { CONFIG } from './config.js';
import { board, currentPiece, holdPiece, nextPieces, score, level, linesCleared, isGameOver, isGameClear, isValidPosition } from './game.js';
import { effects, tspinEffect } from './effects.js';
import { attackBarSegments, MAX_ATTACK, PHASE1, PHASE2, PHASE3 } from './garbage.js';
import { drawminiboardloop, socket, drawCountdown, drawConnectError } from './online.js'; // Import drawConnectError

export const gameCanvas = document.getElementById('gameCanvas');
export const gameCtx = gameCanvas.getContext('2d');

export const overlayCanvas = document.getElementById('overlayCanvas');
export const overlayCtx = overlayCanvas.getContext('2d');

export function resizeCanvas() {
    gameCanvas.width = window.innerWidth;
    gameCanvas.height = window.innerHeight;
    overlayCanvas.width = window.innerWidth;
    overlayCanvas.height = window.innerHeight;
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function tetrominoTypeToIndex(type) {
    switch (type) {
        case 'I': return 1;
        case 'J': return 2;
        case 'L': return 3;
        case 'O': return 4;
        case 'S': return 5;
        case 'T': return 6;
        case 'Z': return 7;
        default: return 0;
    }
}

// drawMiniPiece now accepts a context
function drawMiniPiece(ctx, piece, posX, posY, cs) {
    const shape = piece.shape[0];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    shape.forEach(([x, y]) => {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    });
    const offsetX = Math.floor((4 - (maxX - minX + 1)) / 2) - minX;
    const offsetY = Math.floor((4 - (maxY - minY + 1)) / 2) - minY;
    shape.forEach(([x, y]) => {
        const drawX = posX + (x + offsetX) * cs;
        const drawY = posY + (y + offsetY) * cs;
        ctx.fillStyle = piece.color;
        ctx.fillRect(drawX, drawY, cs, cs);
        ctx.strokeStyle = '#000';
        ctx.strokeRect(drawX, drawY, cs, cs);
    });
}

// drawGameOver now accepts a context
function drawGameOver(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.fillStyle = '#FF0000';
    ctx.font = 'bold 50px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Game Over', ctx.canvas.width / 2, ctx.canvas.height / 2);
    socket.emit('PlayerGameStatus', 'gameover');
}

// drawGameClear now accepts a context
function drawGameClear(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.fillStyle = '#FF0000';
    ctx.font = 'bold 50px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('You Win', ctx.canvas.width / 2, ctx.canvas.height / 2);
    socket.emit('PlayerGameStatus', 'gameover');
}

// New drawGame function for game elements
export function drawGame() {
    gameCtx.fillStyle = CONFIG.colors.background;
    gameCtx.fillRect(0, 0, gameCanvas.width, gameCanvas.height);

    const attackBarWidth = 30, gap = 20;
    const boardWidth = CONFIG.board.cols * CONFIG.board.cellSize;
    const boardHeight = CONFIG.board.visibleRows * CONFIG.board.cellSize;
    const totalWidth = attackBarWidth + gap + boardWidth;
    const startX = (gameCanvas.width - totalWidth) / 2;
    const attackBarX = startX;
    const boardX = startX + attackBarWidth + gap;
    const boardY = (gameCanvas.height - boardHeight) / 2;

    // Draw board
    gameCtx.fillStyle = CONFIG.colors.boardBackground;
    gameCtx.fillRect(boardX, boardY, boardWidth, boardHeight);
    for (let r = CONFIG.board.rows - CONFIG.board.visibleRows; r < CONFIG.board.rows; r++) {
        for (let c = 0; c < CONFIG.board.cols; c++) {
            const cell = board[r][c];
            if (cell !== 0) {
                gameCtx.fillStyle = cell === 'G' ? '#555' : CONFIG.colors.tetromino[tetrominoTypeToIndex(cell)];
                gameCtx.fillRect(boardX + c * CONFIG.board.cellSize,
                    boardY + (r - (CONFIG.board.rows - CONFIG.board.visibleRows)) * CONFIG.board.cellSize,
                    CONFIG.board.cellSize, CONFIG.board.cellSize);
                gameCtx.strokeStyle = '#000';
                gameCtx.strokeRect(boardX + c * CONFIG.board.cellSize,
                    boardY + (r - (CONFIG.board.rows - CONFIG.board.visibleRows)) * CONFIG.board.cellSize,
                    CONFIG.board.cellSize, CONFIG.board.cellSize);
            }
        }
    }

    // Draw current piece and ghost
    if (currentPiece) {
        const ghost = Object.assign({}, currentPiece);
        while (isValidPosition(ghost, 0, 1)) ghost.y++;
        gameCtx.globalAlpha = 0.3;
        gameCtx.fillStyle = CONFIG.colors.ghost;
        ghost.shape[ghost.rotation].forEach(([dx, dy]) => {
            const gx = ghost.x + dx, gy = ghost.y + dy;
            if (gy >= 0) {
                gameCtx.fillRect(boardX + gx * CONFIG.board.cellSize,
                    boardY + (gy - (CONFIG.board.rows - CONFIG.board.visibleRows)) * CONFIG.board.cellSize,
                    CONFIG.board.cellSize, CONFIG.board.cellSize);
            }
        });
        gameCtx.globalAlpha = 1.0;

        gameCtx.fillStyle = currentPiece.color;
        currentPiece.shape[currentPiece.rotation].forEach(([dx, dy]) => {
            const x = currentPiece.x + dx, y = currentPiece.y + dy;
            if (y >= 0) {
                gameCtx.fillRect(boardX + x * CONFIG.board.cellSize,
                    boardY + (y - (CONFIG.board.rows - CONFIG.board.visibleRows)) * CONFIG.board.cellSize,
                    CONFIG.board.cellSize, CONFIG.board.cellSize);
                gameCtx.strokeStyle = '#000';
                gameCtx.strokeRect(boardX + x * CONFIG.board.cellSize,
                    boardY + (y - (CONFIG.board.rows - CONFIG.board.visibleRows)) * CONFIG.board.cellSize,
                    CONFIG.board.cellSize, CONFIG.board.cellSize);
            }
        });
    }

    // Draw line clear effects
    const now = Date.now();
    effects.forEach(effect => {
        if (effect.type === 'lineClear') {
            const alpha = Math.max(0, 1 - (now - effect.startTime) / effect.duration);
            gameCtx.fillStyle = `rgba(255,255,0,${alpha})`;
            effect.rows.forEach(row => {
                const displayRow = row - (CONFIG.board.rows - CONFIG.board.visibleRows);
                if (displayRow >= 0) {
                    gameCtx.fillRect(boardX, boardY + displayRow * CONFIG.board.cellSize, boardWidth, CONFIG.board.cellSize);
                }
            });
        }
    });
}

// New drawUI function for UI elements
export function drawUI() {
    // Clear overlay canvas
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    const attackBarWidth = 30, gap = 20;
    const boardWidth = CONFIG.board.cols * CONFIG.board.cellSize;
    const boardHeight = CONFIG.board.visibleRows * CONFIG.board.cellSize;
    const totalWidth = attackBarWidth + gap + boardWidth;
    const startX = (overlayCanvas.width - totalWidth) / 2;
    const attackBarX = startX;
    const boardX = startX + attackBarWidth + gap;
    const boardY = (overlayCanvas.height - boardHeight) / 2;

    // Draw attack bar
    overlayCtx.strokeStyle = '#000';
    overlayCtx.strokeRect(attackBarX, boardY, attackBarWidth, boardHeight);
    let currentY = boardY + boardHeight;
    for (const seg of attackBarSegments) {
        const segHeight = boardHeight * (seg.value / (MAX_ATTACK * 0.3));
        const elapsed = Date.now() - seg.timestamp;
        const segColor = elapsed < PHASE1 ? 'white' : elapsed < PHASE2 ? 'yellow'
            : elapsed < PHASE3 ? 'red' : (Math.floor(Date.now() / 300) % 2 === 0 ? 'red' : 'white');
        overlayCtx.fillStyle = segColor;
        currentY -= segHeight;
        overlayCtx.fillRect(attackBarX, currentY, attackBarWidth, segHeight);
    }

    // Draw T-spin effect text
    if (tspinEffect) {
        const now = Date.now();
        const alpha = Math.max(0, 1 - (now - tspinEffect.startTime) / tspinEffect.duration);
        overlayCtx.fillStyle = `rgba(255,255,0,${alpha})`;
        overlayCtx.font = 'bold 40px sans-serif';
        overlayCtx.textAlign = 'center';
        overlayCtx.fillText('T-SPIN!', boardX + boardWidth / 2, boardY + boardHeight / 2);
    }

    // Draw Hold box
    const previewSize = Math.floor(CONFIG.board.cellSize * 0.8);
    const holdBoxX = startX - 20 - previewSize * 4, holdBoxY = boardY;
    overlayCtx.strokeStyle = '#FFF';
    overlayCtx.lineWidth = 2;
    overlayCtx.strokeRect(holdBoxX - 5, holdBoxY - 5, previewSize * 4 + 10, previewSize * 4 + 10);
    overlayCtx.fillStyle = '#fff';
    overlayCtx.font = 'bold 18px sans-serif';
    overlayCtx.textAlign = 'left';
    overlayCtx.fillText('HOLD', holdBoxX, holdBoxY - 20);
    if (holdPiece) drawMiniPiece(overlayCtx, holdPiece, holdBoxX, holdBoxY, previewSize);

    // Draw Next box
    const nextBoxX = boardX + boardWidth + 20, nextBoxY = boardY;
    overlayCtx.strokeStyle = '#FFF';
    overlayCtx.lineWidth = 2;
    overlayCtx.strokeRect(nextBoxX - 5, nextBoxY - 5, previewSize * 4 + 10, previewSize * 15 + 10);
    overlayCtx.fillText('NEXT', nextBoxX, nextBoxY - 20);
    for (let i = 0; i < Math.min(5, nextPieces.length); i++) {
        drawMiniPiece(overlayCtx, nextPieces[i], nextBoxX, nextBoxY + i * previewSize * 3, previewSize);
    }

    // Draw Score, Lines, Level
    overlayCtx.fillStyle = '#fff';
    overlayCtx.font = 'bold 20px sans-serif';
    overlayCtx.textAlign = 'left';
    overlayCtx.fillText(`Score: ${score}`, boardX, boardY + boardHeight + 30);
    overlayCtx.fillText(`Lines: ${linesCleared}`, boardX, boardY + boardHeight + 60);
    overlayCtx.fillText(`Level: ${level}`, boardX, boardY + boardHeight + 90);

    // Draw mini-boards (from online.js)
    if (!isGameOver && !isGameClear) {
        drawminiboardloop(); // Pass overlayCtx
    }

    // Draw Game Over / Game Clear messages
    if (isGameOver) drawGameOver(overlayCtx);
    if (isGameClear) drawGameClear(overlayCtx);

    // Draw Countdown (from online.js)
    drawCountdown();
    
}