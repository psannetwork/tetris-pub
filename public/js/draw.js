
'use strict';
import { CONFIG } from './config.js';
import { board, currentPiece, holdPiece, nextPieces, isValidPosition } from './game.js';
import { getStats } from './main.js';
import { effects } from './effects.js';
import { attackBarSegments, MAX_ATTACK } from './garbage.js';

// --- Layout Constants ---
export let CELL_SIZE;
export { CELL_SIZE as MAIN_BOARD_CELL_SIZE };
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

let gameCtx, holdCtx, nextCtx, attackBarCtx;;
let boardCanvas, boardCtx; // Off-screen canvas for the board
let scoreDisplay;
let screenShake = { intensity: 0, duration: 0, endTime: 0 };

// --- Main Setup Function ---
export function setupCanvases() {
    // Fixed dimensions based on user requirements
    CELL_SIZE = 30; // 300px board width / 10 columns
    BOARD_WIDTH = 300;
    BOARD_HEIGHT = 600;
    ATTACK_BAR_WIDTH = 30;
    HOLD_BOX_WIDTH = 96;
    HOLD_BOX_HEIGHT = 96;
    NEXT_BOX_WIDTH = 96;
    NEXT_BOX_HEIGHT = 456; // Changed from 480 to 456 (76px * 6 pieces)
    SCORE_AREA_HEIGHT = 100; // Arbitrary fixed height for score display

    // --- Create Canvases and Set Element Sizes ---
    gameCtx = createCanvas('main-game-board', BOARD_WIDTH, BOARD_HEIGHT).ctx;
    holdCtx = createCanvas('hold-box', HOLD_BOX_WIDTH, HOLD_BOX_HEIGHT).ctx;
    nextCtx = createCanvas('next-box', NEXT_BOX_WIDTH, NEXT_BOX_HEIGHT).ctx;
    attackBarCtx = createCanvas('attack-bar', ATTACK_BAR_WIDTH, BOARD_HEIGHT).ctx;
    scoreDisplay = document.getElementById('score-display');

    // Create the off-screen canvas for the board
    boardCanvas = document.createElement('canvas');
    boardCanvas.width = BOARD_WIDTH;
    boardCanvas.height = BOARD_HEIGHT;
    boardCtx = boardCanvas.getContext('2d');

    // Set the height of the next-box HTML element to match NEXT_BOX_HEIGHT
    const nextBoxElement = document.getElementById('next-box');
    if (nextBoxElement) {
        nextBoxElement.style.height = `${NEXT_BOX_HEIGHT}px`;
    }

    scoreDisplay.style.width = `${NEXT_BOX_WIDTH}px`;
    scoreDisplay.style.height = `${SCORE_AREA_HEIGHT}px`;
    scoreDisplay.style.fontSize = `1.2rem`; // Fixed font size

    // Remove panel height adjustments as they are handled by CSS now
    // const leftPanel = document.querySelector('.game-panel-left');
    // if (leftPanel) leftPanel.style.height = '';
    // const rightPanel = document.querySelector('.game-panel-right');
    // if (rightPanel) rightPanel.style.height = '';

    // Notify other components that layout has changed
    window.dispatchEvent(new CustomEvent('layout-changed'));
    drawBoard();
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

export function drawBoard() {
    if (!boardCtx) return;
    boardCtx.fillStyle = CONFIG.colors.boardBackground;
    boardCtx.fillRect(0, 0, boardCanvas.width, boardCanvas.height);

    const startRow = CONFIG.board.rows - CONFIG.board.visibleRows;
    for (let r = startRow; r < CONFIG.board.rows; r++) {
        for (let c = 0; c < CONFIG.board.cols; c++) {
            if (board[r][c] !== 0) {
                drawBlock(boardCtx, c * CELL_SIZE, (r - startRow) * CELL_SIZE, board[r][c], CELL_SIZE);
            }
        }
    }
}

export function drawGame() {
    if (!gameCtx) return;
    
    gameCtx.save();
    const now = performance.now();

    // --- Apply screen shake ---
    if (now < screenShake.endTime) {
        const progress = (screenShake.endTime - now) / screenShake.duration;
        const intensity = screenShake.intensity * progress * progress; // Ease-out effect
        const x = (Math.random() - 0.5) * intensity;
        const y = (Math.random() - 0.5) * intensity;
        gameCtx.translate(x, y);
    }
    
    // --- Draw the pre-rendered board ---
    gameCtx.clearRect(0, 0, gameCtx.canvas.width, gameCtx.canvas.height);
    gameCtx.drawImage(boardCanvas, 0, 0);

    // --- Draw dynamic elements (ghost, current piece) ---
    if (currentPiece) {
        // Draw ghost piece
        const ghost = { ...currentPiece };
        while (isValidPosition(ghost, 0, 1)) {
            ghost.y++;
        }
        gameCtx.globalAlpha = 0.3;
        drawPiece(gameCtx, ghost, 0, 0);
        gameCtx.globalAlpha = 1.0;

        // Draw current piece
        drawPiece(gameCtx, currentPiece, 0, 0);
    }

    // --- Draw effects (line clears, particles) ---
    effects.forEach(effect => {
        const progress = (now - effect.startTime) / effect.duration;
        if (progress >= 1) return; // Skip finished effects

        const alpha = Math.max(0, 1 - progress);

        if (effect.type === 'lineClear') {
            gameCtx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.8})`;
            const startRow = CONFIG.board.rows - CONFIG.board.visibleRows;
            effect.rows.forEach(row => {
                const y = (row - startRow) * CELL_SIZE;
                if (y >= 0) gameCtx.fillRect(0, y, BOARD_WIDTH, CELL_SIZE);
            });
        } else if (effect.type === 'particle') {
            const rgb = hexToRgb(effect.color);
            if (rgb) {
                gameCtx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
                gameCtx.beginPath();
                // Update particle position for simple gravity effect
                effect.y += effect.vy * progress;
                effect.x += effect.vx * progress;
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

    const now = performance.now();
    let currentY = BOARD_HEIGHT;
    
    for (const seg of attackBarSegments) {
        const segHeight = BOARD_HEIGHT * (seg.value / MAX_ATTACK);
        
        let segmentColor;
        
        const elapsed = seg.timestamp ? (now - seg.timestamp) : 0;
        
        // --- DEBUGGING LOGS --- 
        console.log(`Segment value: ${seg.value}, Timestamp: ${seg.timestamp}, Now: ${now}, Elapsed: ${elapsed}`);
        // --- END DEBUGGING LOGS ---

        if (elapsed >= 12000) {
            // 12秒以上経過: 点滅（100msごとに赤と白）
            const flashSpeed = 100;
            const isBright = Math.floor(now / flashSpeed) % 2 === 0;
            segmentColor = isBright ? '#FF0000' : '#FFFFFF';
        } else if (elapsed >= 8000) {
            // 8秒以上経過: 赤
            segmentColor = '#FF0000';
        } else if (elapsed >= 4000) {
            // 4秒以上経過: 黄
            segmentColor = '#FFFF00';
        } else {
            // それ以外: 白
            segmentColor = '#FFFFFF';
        }
        
        attackBarCtx.fillStyle = segmentColor;
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
