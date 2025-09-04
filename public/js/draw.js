'use strict';
import { CONFIG } from './config.js';
import { board, currentPiece, holdPiece, nextPieces, isValidPosition } from './game.js';
import { getStats } from './main.js';
import { effects } from './effects.js';
import { attackBarSegments, MAX_ATTACK } from './garbage.js';

// --- Layout Constants ---
export let CELL_SIZE;
export let BOARD_WIDTH;
export let BOARD_HEIGHT;
export let ATTACK_BAR_WIDTH;
export let ATTACK_BAR_GAP;
export let HOLD_BOX_WIDTH;
export let HOLD_BOX_HEIGHT;
export let HOLD_BOX_GAP;
export let NEXT_BOX_WIDTH;
export let NEXT_BOX_HEIGHT;
export let NEXT_BOX_GAP;
export let SCORE_AREA_HEIGHT;
export let TOTAL_WIDTH;



// --- Canvas & Context Creation ---
function createCanvas(containerId, width, height) {
    const container = document.getElementById(containerId);
    if (!container) throw new Error(`Container #${containerId} not found.`);
    container.innerHTML = ''; // Clear previous canvas if any
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    container.appendChild(canvas);
    return { canvas, ctx: canvas.getContext('2d') };
}

let gameCtx, holdCtx, nextCtx, attackBarCtx;
let scoreDisplay;
let screenShake = { intensity: 0, duration: 0, endTime: 0 };

// --- Main Setup Function ---
export function setupCanvases() {
    const gameContainer = document.getElementById('game-container');
    const screenWidth = gameContainer.offsetWidth;
    const screenHeight = gameContainer.offsetHeight;

    // Define relative sizes for elements based on board cell units
    const BOARD_COLS = CONFIG.board.cols;
    const BOARD_VISIBLE_ROWS = CONFIG.board.visibleRows;

    const HOLD_BOX_COLS = 4; // Estimated
    const HOLD_BOX_ROWS = 4; // Estimated
    const NEXT_BOX_COLS = 4; // Estimated
    const NEXT_PIECE_HEIGHT_IN_CELLS = 4; // Each next piece takes about 4 cells vertically
    const ATTACK_BAR_COLS = 1;
    const SCORE_AREA_ROWS = 3; // Estimated for score display

    const GAP_COLS = 1; // Gap between elements in cell units
    const GAP_ROWS = 1; // Gap between elements in cell units

    // Calculate potential CELL_SIZE based on width constraints
    const totalColsNeeded = HOLD_BOX_COLS + GAP_COLS + ATTACK_BAR_COLS + GAP_COLS + BOARD_COLS + GAP_COLS + NEXT_BOX_COLS;
    const cellSizeFromWidth = screenWidth / totalColsNeeded;

    // Calculate potential CELL_SIZE based on height constraints
    const totalRowsNeeded = BOARD_VISIBLE_ROWS + GAP_ROWS + SCORE_AREA_ROWS; // Board + gap + score
    const cellSizeFromHeight = screenHeight / totalRowsNeeded;

    CELL_SIZE = Math.floor(Math.min(cellSizeFromWidth, cellSizeFromHeight));

    // Ensure a minimum CELL_SIZE to prevent elements from becoming too small
    CELL_SIZE = Math.max(CELL_SIZE, 10); // Minimum 10px cell size

    // Recalculate all dimensions based on the new CELL_SIZE
    BOARD_WIDTH = BOARD_COLS * CELL_SIZE;
    BOARD_HEIGHT = BOARD_VISIBLE_ROWS * CELL_SIZE;
    ATTACK_BAR_WIDTH = ATTACK_BAR_COLS * CELL_SIZE;
    HOLD_BOX_WIDTH = HOLD_BOX_COLS * CELL_SIZE;
    HOLD_BOX_HEIGHT = HOLD_BOX_ROWS * CELL_SIZE;
    NEXT_BOX_WIDTH = NEXT_BOX_COLS * CELL_SIZE;
    NEXT_BOX_HEIGHT = CONFIG.game.nextPiecesCount * NEXT_PIECE_HEIGHT_IN_CELLS * CELL_SIZE;
    SCORE_AREA_HEIGHT = SCORE_AREA_ROWS * CELL_SIZE; // Define SCORE_AREA_HEIGHT here

    TOTAL_WIDTH = HOLD_BOX_WIDTH + HOLD_BOX_GAP + ATTACK_BAR_WIDTH + ATTACK_BAR_GAP + BOARD_WIDTH + NEXT_BOX_GAP + NEXT_BOX_WIDTH;

    gameCtx = createCanvas('main-game-board', BOARD_WIDTH, BOARD_HEIGHT).ctx;
    holdCtx = createCanvas('hold-box', HOLD_BOX_WIDTH, HOLD_BOX_HEIGHT).ctx;
    nextCtx = createCanvas('next-box', NEXT_BOX_WIDTH, NEXT_BOX_HEIGHT).ctx;
    attackBarCtx = createCanvas('attack-bar', ATTACK_BAR_WIDTH, BOARD_HEIGHT).ctx;
    scoreDisplay = document.getElementById('score-display');

    // Update the font size and dimensions for scoreDisplay based on CELL_SIZE
    scoreDisplay.style.fontSize = `${CELL_SIZE * 0.5}px`; // Example: half of cell size
    scoreDisplay.style.width = `${NEXT_BOX_WIDTH}px`; // Give it a width
    scoreDisplay.style.height = `${SCORE_AREA_ROWS * CELL_SIZE}px`; // Give it a height
    scoreDisplay.style.textAlign = 'center'; // Center text
    scoreDisplay.style.display = 'flex'; // Use flexbox for vertical centering
    scoreDisplay.style.flexDirection = 'column';
    scoreDisplay.style.justifyContent = 'center';
    scoreDisplay.style.alignItems = 'center';

    window.dispatchEvent(new CustomEvent('layout-changed'));
}

function positionElement(id, x, y) {
    const el = document.getElementById(id);
    if (el) {
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
    }
}

window.addEventListener('resize', setupCanvases);

export function triggerScreenShake(intensity, duration) {
    screenShake.intensity = intensity;
    screenShake.duration = duration;
    screenShake.endTime = performance.now() + duration;
}

// --- Drawing Functions ---

export function drawGame() {
    if (!gameCtx) return;
    
    gameCtx.save();
    const now = performance.now();

    if (now < screenShake.endTime) {
        const progress = (screenShake.endTime - now) / screenShake.duration;
        const intensity = screenShake.intensity * progress * progress;
        const x = (Math.random() - 0.5) * intensity;
        const y = (Math.random() - 0.5) * intensity;
        gameCtx.translate(x, y);
    }

    gameCtx.clearRect(0, 0, gameCtx.canvas.width, gameCtx.canvas.height);
    gameCtx.fillStyle = CONFIG.colors.boardBackground;
    gameCtx.fillRect(0, 0, gameCtx.canvas.width, gameCtx.canvas.height);

    const startRow = CONFIG.board.rows - CONFIG.board.visibleRows;
    for (let r = startRow; r < CONFIG.board.rows; r++) {
        for (let c = 0; c < CONFIG.board.cols; c++) {
            if (board[r][c] !== 0) {
                drawBlock(gameCtx, c * CELL_SIZE, (r - startRow) * CELL_SIZE, board[r][c], CELL_SIZE);
            }
        }
    }

    if (currentPiece) {
        const ghost = { ...currentPiece };
        while (isValidPosition(ghost, 0, 1)) {
            ghost.y++;
        }
        gameCtx.globalAlpha = 0.3;
        drawPiece(gameCtx, ghost, 0, 0);
        gameCtx.globalAlpha = 1.0;
        drawPiece(gameCtx, currentPiece, 0, 0);
    }

    // Draw effects
    effects.forEach(effect => {
        const progress = (now - effect.startTime) / effect.duration;
        const alpha = Math.max(0, 1 - progress);
        if (effect.type === 'lineClear') {
            gameCtx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.8})`;
            effect.rows.forEach(row => {
                const y = (row - startRow) * CELL_SIZE;
                if (y >= 0) gameCtx.fillRect(0, y, BOARD_WIDTH, CELL_SIZE);
            });
        } else if (effect.type === 'particle') {
            const rgb = hexToRgb(effect.color);
            if (rgb) {
                gameCtx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
                gameCtx.beginPath();
                gameCtx.arc(effect.x, effect.y, effect.size, 0, Math.PI * 2);
                gameCtx.fill();
            }
        }
    });

    gameCtx.restore();
}

export function drawUI() {
    drawAttackBar();
    drawHoldPiece();
    drawNextPieces();
    drawScore();
}

function drawAttackBar() {
    if (!attackBarCtx) return;
    attackBarCtx.clearRect(0, 0, attackBarCtx.canvas.width, attackBarCtx.canvas.height);
    attackBarCtx.fillStyle = '#111';
    attackBarCtx.fillRect(0, 0, ATTACK_BAR_WIDTH, BOARD_HEIGHT);

    let currentY = BOARD_HEIGHT;
    for (const seg of attackBarSegments) {
        const segHeight = BOARD_HEIGHT * (seg.value / MAX_ATTACK);
        attackBarCtx.fillStyle = seg.type === 'pending' ? '#F9A825' : CONFIG.colors.attackBar;
        currentY -= segHeight;
        attackBarCtx.fillRect(0, currentY, ATTACK_BAR_WIDTH, segHeight);
    }
}

function drawHoldPiece() {
    if (!holdCtx) return;
    holdCtx.clearRect(0, 0, HOLD_BOX_WIDTH, HOLD_BOX_HEIGHT);
    drawUITitledBox(holdCtx, 0, 0, HOLD_BOX_WIDTH, HOLD_BOX_HEIGHT, 'HOLD');
    if (holdPiece) {
        drawMiniPiece(holdCtx, holdPiece, 0, 0, HOLD_BOX_WIDTH, HOLD_BOX_HEIGHT);
    }
}

function drawNextPieces() {
    if (!nextCtx) return;
    nextCtx.clearRect(0, 0, NEXT_BOX_WIDTH, NEXT_BOX_HEIGHT);
    drawUITitledBox(nextCtx, 0, 0, NEXT_BOX_WIDTH, NEXT_BOX_HEIGHT, 'NEXT');
    const boxCellHeight = NEXT_BOX_HEIGHT / CONFIG.game.nextPiecesCount;
    for (let i = 0; i < CONFIG.game.nextPiecesCount; i++) {
        if (nextPieces[i]) {
            drawMiniPiece(nextCtx, nextPieces[i], 0, i * boxCellHeight, NEXT_BOX_WIDTH, boxCellHeight);
        }
    }
}

function drawScore() {
    if (!scoreDisplay) return;
    const stats = getStats();
    scoreDisplay.innerHTML = `Time: ${stats.time}<br>Score: ${stats.score}<br>Lines: ${stats.lines}<br>Level: ${stats.level}<br>PPS: ${stats.pps}<br>APM: ${stats.apm}`;
}

// --- Helper Functions ---

function hexToRgb(hex) {
    if (!hex) return null;
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

function drawUITitledBox(ctx, x, y, w, h, title) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#ecf0f1';
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = '#ecf0f1';
    ctx.font = `bold ${CELL_SIZE * 0.6}px Exo 2`; // Dynamic font size
    ctx.textAlign = 'center';
    ctx.fillText(title, x + w / 2, y + CELL_SIZE * 0.7);
    ctx.textAlign = 'left';
}

function drawMiniPiece(ctx, piece, boxX, boxY, boxW, boxH) {
    const shape = piece.shape[0];
    const miniCellSize = Math.floor(boxW / 5);
    const pieceWidth = (Math.max(...shape.map(p => p[0])) - Math.min(...shape.map(p => p[0])) + 1) * miniCellSize;
    const pieceHeight = (Math.max(...shape.map(p => p[1])) - Math.min(...shape.map(p => p[1])) + 1) * miniCellSize;
    const offsetX = boxX + (boxW - pieceWidth) / 2 - Math.min(...shape.map(p => p[0])) * miniCellSize;
    const offsetY = boxY + (boxH - pieceHeight) / 2 - Math.min(...shape.map(p => p[1])) * miniCellSize;
    shape.forEach(([x, y]) => {
        drawBlock(ctx, offsetX + x * miniCellSize, offsetY + y * miniCellSize, piece.type, miniCellSize);
    });
}

function drawPiece(ctx, piece, boardX, boardY) {
    const shape = piece.shape[piece.rotation];
    const startRow = CONFIG.board.rows - CONFIG.board.visibleRows;
    shape.forEach(([dx, dy]) => {
        const boardRow = piece.y + dy;
        if (boardRow >= startRow) {
            const drawX = boardX + (piece.x + dx) * CELL_SIZE;
            const drawY = boardY + (boardRow - startRow) * CELL_SIZE;
            drawBlock(ctx, drawX, drawY, piece.type, CELL_SIZE);
        }
    });
}

function lightenDarkenColor(col, amt) {
    let usePound = false;
    if (col[0] === "#") { col = col.slice(1); usePound = true; }
    const num = parseInt(col, 16);
    let r = (num >> 16) + amt; if (r > 255) r = 255; else if (r < 0) r = 0;
    let g = ((num >> 8) & 0x00FF) + amt; if (g > 255) g = 255; else if (g < 0) g = 0;
    let b = (num & 0x0000FF) + amt; if (b > 255) b = 255; else if (b < 0) b = 0;
    return (usePound ? "#" : "") + (r << 16 | g << 8 | b).toString(16).padStart(6, '0');
}

export function tetrominoTypeToIndex(type) {
    const types = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
    return types.indexOf(type);
}

function drawBlock(ctx, x, y, color, size) {
    const typeIndex = tetrominoTypeToIndex(color);
    const baseColor = color === 'G' ? '#555' : (CONFIG.colors.tetromino[typeIndex + 1] || "#808080");
    if (!baseColor) return;
    const lighter = lightenDarkenColor(baseColor, 30);
    const darker = lightenDarkenColor(baseColor, -30);
    ctx.fillStyle = darker;
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = baseColor;
    ctx.fillRect(x + size * 0.1, y + size * 0.1, size * 0.8, size * 0.8);
    const gradient = ctx.createLinearGradient(x, y, x + size, y + size);
    gradient.addColorStop(0, lighter);
    gradient.addColorStop(1, baseColor);
    ctx.fillStyle = gradient;
    ctx.fillRect(x + size * 0.1, y + size * 0.1, size * 0.8, size * 0.8);
}