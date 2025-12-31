'use strict';
import { CONFIG } from '../core/config.js';
import { currentPiece, holdPiece, nextPieces, board, isGameOver, isGameClear, ren, level, isValidPosition } from '../core/game.js';
import { getStats } from '../main.js';
import * as Effects from './effects.js';
import { drawTargetLines } from '../network/online.js';
import { attackBarSegments, MAX_ATTACK } from '../core/garbage.js';
import { isSpectating } from '../network/online.js';
import { CELL_SIZE, BOARD_WIDTH, BOARD_HEIGHT, ATTACK_BAR_WIDTH, HOLD_BOX_WIDTH, HOLD_BOX_HEIGHT, NEXT_BOX_WIDTH, NEXT_BOX_HEIGHT, SCORE_AREA_HEIGHT, setLayoutConstants } from '../ui/layout.js';


import { currentCountdown } from '../network/online.js';

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

let gameCtx, holdCtx, nextCtx, attackBarCtx, effectsCtx, uiCtx;
let boardCanvas, boardCtx; // Off-screen canvas for the board
let effectsCanvas; // Overlay canvas for effects
let uiCanvas; // Canvas for UI elements (time, score, etc.)
let scoreDisplay;
let screenShake = { intensity: 0, duration: 0, endTime: 0 };
let mainBoardOffset = { x: 0, y: 0 };

export function getMainBoardOffset() {
    return mainBoardOffset;
}

// --- Main Setup Function ---
let preRenderedMiniPieces = new Map();
export function setupCanvases() {
    // Fixed dimensions based on user requirements
    const layout = {
        CELL_SIZE: CONFIG.layout.cellSize, // 300px board width / 10 columns
        BOARD_WIDTH: CONFIG.layout.boardWidth,
        BOARD_HEIGHT: CONFIG.layout.boardHeight,
        ATTACK_BAR_WIDTH: CONFIG.layout.attackBarWidth,
        HOLD_BOX_WIDTH: CONFIG.layout.holdBoxWidth,
        HOLD_BOX_HEIGHT: CONFIG.layout.holdBoxHeight,
        NEXT_BOX_WIDTH: CONFIG.layout.nextBoxWidth,
        NEXT_BOX_HEIGHT: CONFIG.layout.nextBoxHeight, // Changed from 480 to 456 (76px * 6 pieces)
        SCORE_AREA_HEIGHT: CONFIG.layout.scoreAreaHeight // Arbitrary fixed height for score display
    };
    setLayoutConstants(layout);

    prerenderAllMiniPieces();

    // --- Create Canvases and Set Element Sizes ---
    gameCtx = createCanvas('main-game-board', BOARD_WIDTH, BOARD_HEIGHT).ctx;
    holdCtx = createCanvas('hold-box', HOLD_BOX_WIDTH, HOLD_BOX_HEIGHT).ctx;
    nextCtx = createCanvas('next-box', NEXT_BOX_WIDTH, NEXT_BOX_HEIGHT).ctx;
    attackBarCtx = createCanvas('attack-bar', ATTACK_BAR_WIDTH, BOARD_HEIGHT).ctx;
    scoreDisplay = document.getElementById('score-display');

    // Get the overlay canvas for effects
    effectsCanvas = document.getElementById('effect-canvas');
    if (effectsCanvas) {
        effectsCtx = effectsCanvas.getContext('2d');
        // Manually set the canvas size to match the wrapper, as defined in CSS
        const wrapper = document.getElementById('overall-game-wrapper');
        if (wrapper) {
            effectsCanvas.width = wrapper.offsetWidth;
            effectsCanvas.height = wrapper.offsetHeight;
        }
    }

    // Get the UI canvas
    uiCanvas = document.getElementById('ui-canvas');
    if (uiCanvas) {
        uiCtx = uiCanvas.getContext('2d');
        // Manually set the canvas size to match the wrapper, as defined in CSS
        const wrapper = document.getElementById('overall-game-wrapper');
        if (wrapper) {
            uiCanvas.width = wrapper.offsetWidth;
            uiCanvas.height = wrapper.offsetHeight;
        }
    }

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
    scoreDisplay.style.fontSize = CONFIG.ui.scoreFontSize; // Fixed font size

    // Notify other components that layout has changed
    window.dispatchEvent(new CustomEvent('layout-changed'));
    drawBoard();

    // Initialize effects module with the new effects canvas
    Effects.initEffects(effectsCanvas);
    const mainBoardElement = document.getElementById('main-game-board');
    const wrapperElement = document.getElementById('overall-game-wrapper');
    if (mainBoardElement && wrapperElement) {
        const boardRect = mainBoardElement.getBoundingClientRect();
        const wrapperRect = wrapperElement.getBoundingClientRect();
        mainBoardOffset.x = boardRect.left - wrapperRect.left;
        mainBoardOffset.y = boardRect.top - wrapperRect.top;
    }
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
        const intensity = screenShake.intensity * progress ** CONFIG.effects.screenShakeEaseOutFactor * CONFIG.effects.screenShakeIntensityFactor; // Ease-out effect
        const x = (Math.random() - 0.5) * intensity;
        const y = (Math.random() - 0.5) * intensity;
        gameCtx.translate(x, y);
    }
    
    // --- Draw the pre-rendered board ---
    gameCtx.clearRect(0, 0, gameCtx.canvas.width, gameCtx.canvas.height);
    gameCtx.drawImage(boardCanvas, 0, 0);

    // --- Draw dynamic elements (ghost, current piece) ---
    if (currentPiece) {
        const startRow = CONFIG.board.rows - CONFIG.board.visibleRows;

        // Draw ghost piece (lower opacity for better distinction)
        const ghost = { ...currentPiece };
        while (isValidPosition(ghost, 0, 1)) {
            ghost.y++;
        }
        gameCtx.globalAlpha = 0.25; // Slightly lower than default
        drawPiece(gameCtx, ghost, 0, 0);
        gameCtx.globalAlpha = 1.0;

        // Draw current piece with a subtle glow if falling fast
        const isFastFalling = (level >= 50); // High intensity levels
        if (isFastFalling) {
            gameCtx.shadowBlur = 10;
            gameCtx.shadowColor = CONFIG.colors.tetromino[tetrominoTypeToIndex(currentPiece.type) + 1] || "#FFF";
        }

        drawPiece(gameCtx, currentPiece, 0, 0);
        
        // Reset shadow
        gameCtx.shadowBlur = 0;
    }


    // Effects are now drawn separately in main.js by drawAllEffects()
    gameCtx.restore();
}


export function drawUI() {
    drawAttackBar();
    drawHoldPiece();
    drawNextPieces();
    drawScore();

    // Draw UI elements on the UI canvas if it exists
    if (uiCanvas && uiCtx) {
        drawUIElements();
    }
}

import { gameState } from '../core/game.js';

function drawCountdown() {
    if (!uiCtx || !currentCountdown) return;

    // 観戦中やロビー画面ではカウントダウン/待機メッセージを表示しない
    if (gameState === 'LOBBY' || isSpectating) return;

    uiCtx.save();
    
    // カウントダウン表示の設定
    const centerX = uiCanvas.width / 2;
    const centerY = uiCanvas.height / 2;
    
    uiCtx.textAlign = 'center';
    uiCtx.textBaseline = 'middle';
    
    if (typeof currentCountdown === 'number') {
        // 数字のカウントダウン
        uiCtx.font = `bold 100px ${CONFIG.ui.fontFamily}`;
        uiCtx.fillStyle = '#fff';
        uiCtx.strokeStyle = '#000';
        uiCtx.lineWidth = 5;
        uiCtx.strokeText(currentCountdown, centerX, centerY);
        uiCtx.fillText(currentCountdown, centerX, centerY);
    } else {
        // 「プレイヤーを待機中です...」などの文字列
        uiCtx.font = `bold 60px ${CONFIG.ui.fontFamily}`;
        uiCtx.fillStyle = '#fff';
        uiCtx.strokeStyle = '#000';
        uiCtx.lineWidth = 4;
        uiCtx.strokeText(currentCountdown, centerX, centerY);
        uiCtx.fillText(currentCountdown, centerX, centerY);
    }
    
    uiCtx.restore();
}

function drawUIElements() {
    if (!uiCtx) return;

    // Clear the UI canvas
    uiCtx.clearRect(0, 0, uiCanvas.width, uiCanvas.height);
    
    // Draw Countdown or Waiting messages
    drawCountdown();

    // Draw score and time information on the UI canvas
    if (scoreDisplay) {
        const stats = getStats();
        const uiText = `Time: ${stats.time}\nPlayers: ${stats.playersLeft}\nScore: ${stats.score}\nLines: ${stats.lines}\nLevel: ${stats.level}\nPPS: ${stats.pps}\nAPM: ${stats.apm}`;

        // Set text properties
        uiCtx.font = CONFIG.ui.scoreFontSize + ' ' + CONFIG.ui.fontFamily;

        // Apply score update effect if active
        let textColor = '#ecf0f1'; // Default color
        let textScale = 1; // Default scale

        if (Effects.scoreUpdateEffect) {
            const now = performance.now();
            const progress = (now - Effects.scoreUpdateEffect.startTime) / Effects.scoreUpdateEffect.duration;

            if (progress < 1) {
                textScale = 1 + Math.sin(progress * Math.PI) * CONFIG.effects.scoreUpdateScaleFactor; // Scale effect
                const opacity = 1 - progress;
                textColor = `rgba(255, 255, 0, ${opacity})`; // Yellow fading out
            }
        }

        uiCtx.fillStyle = textColor;
        uiCtx.textAlign = 'left';
        uiCtx.textBaseline = 'top';

        // Position the text in the same area as the old score display
        const nextBoxElement = document.getElementById('next-box');
        if (nextBoxElement) {
            const nextBoxRect = nextBoxElement.getBoundingClientRect();
            const wrapper = document.getElementById('overall-game-wrapper');
            if (wrapper) {
                const wrapperRect = wrapper.getBoundingClientRect();
                const x = nextBoxRect.left - wrapperRect.left;
                const y = nextBoxRect.bottom - wrapperRect.top;

                // Apply scale effect by transforming the context
                uiCtx.save();
                uiCtx.translate(x, y);
                uiCtx.scale(textScale, textScale);

                // Draw each line separately
                const lines = uiText.split('\n');
                for (let i = 0; i < lines.length; i++) {
                    uiCtx.fillText(lines[i], 0, i * 20);
                }

                uiCtx.restore();
            }
        } else {
            // Fallback position if next-box element is not found
            uiCtx.fillText(uiText, 10, 10);
        }
    }
}

function drawAttackBar() {
    if (!attackBarCtx) return;
    attackBarCtx.clearRect(0, 0, attackBarCtx.canvas.width, attackBarCtx.canvas.height);
    attackBarCtx.fillStyle = '#111';
    attackBarCtx.fillRect(0, 0, ATTACK_BAR_WIDTH, BOARD_HEIGHT);

    const now = performance.now();
    let currentY = BOARD_HEIGHT;
    
    // Level-based speed multiplier: increases speed by 10% per level up to level 20
    const levelFactor = Math.min(20, level || 1);
    const speedMultiplier = 1 + (levelFactor - 1) * 0.15;
    
    // Adjusted thresholds and flash speed
    const flashSpeed = CONFIG.effects.attackBarFlashSpeed / speedMultiplier;
    const timeThreshold1 = CONFIG.effects.attackBarFlashTime1 / speedMultiplier;
    const timeThreshold2 = CONFIG.effects.attackBarFlashTime2 / speedMultiplier;
    const timeThreshold3 = CONFIG.effects.attackBarFlashTime3 / speedMultiplier;

    for (const seg of attackBarSegments) {
        const segHeight = BOARD_HEIGHT * (seg.value / MAX_ATTACK);
        
        let segmentColor;
        const elapsed = seg.timestamp ? (now - seg.timestamp) : 0;

        if (elapsed >= timeThreshold1) {
            // High danger: Fast flashing
            const isBright = Math.floor(now / flashSpeed) % 2 === 0;
            segmentColor = isBright ? '#FF0000' : '#FFFFFF';
        } else if (elapsed >= timeThreshold2) {
            // Danger: Solid red
            segmentColor = '#FF0000';
        } else if (elapsed >= timeThreshold3) {
            // Warning: Yellow
            segmentColor = '#FFFF00';
        } else {
            // Safe: White
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
        drawMiniPiece(holdCtx, holdPiece, 0, 0, HOLD_BOX_WIDTH, HOLD_BOX_HEIGHT, true);
    }
}

function drawNextPieces() {
    if (!nextCtx) return;
    nextCtx.clearRect(0, 0, NEXT_BOX_WIDTH, NEXT_BOX_HEIGHT);
    drawUITitledBox(nextCtx, 0, 0, NEXT_BOX_WIDTH, NEXT_BOX_HEIGHT, 'NEXT');
    
    // Estimate space for the title to prevent overlap with the first piece
    const titleReserveHeight = CELL_SIZE * (CONFIG.ui.titledBoxTitleOffset + CONFIG.ui.titledBoxFontScale * 0.5); // title offset + half font height
    
    const remainingHeight = NEXT_BOX_HEIGHT - titleReserveHeight;
    const boxCellHeight = remainingHeight / CONFIG.game.nextPiecesCount;

    for (let i = 0; i < CONFIG.game.nextPiecesCount; i++) {
        if (nextPieces[i]) {
            drawMiniPiece(nextCtx, nextPieces[i], 0, titleReserveHeight + i * boxCellHeight, NEXT_BOX_WIDTH, boxCellHeight, false);
        }
    }
}

function drawScore() {
    // Score display is now handled on the UI canvas in drawUIElements
    // Update the HTML element for screen readers/accessibility but keep it visually hidden via CSS
    if (scoreDisplay) {
        const stats = getStats();
        scoreDisplay.innerHTML = `Time: ${stats.time}<br>Score: ${stats.score}<br>Lines: ${stats.lines}<br>Level: ${stats.level}<br>PPS: ${stats.pps}<br>APM: ${stats.apm}`;
    }
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
    ctx.fillStyle = CONFIG.colors.uiPanel;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#ecf0f1';
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = '#ecf0f1';
    ctx.font = `bold ${CELL_SIZE * CONFIG.ui.titledBoxFontScale}px ${CONFIG.ui.fontFamily}`; // Dynamic font size
    ctx.textAlign = 'center';
    ctx.fillText(title, x + w / 2, y + CELL_SIZE * CONFIG.ui.titledBoxTitleOffset);
    ctx.textAlign = 'left';
}

function drawMiniPiece(ctx, piece, boxX, boxY, boxW, boxH, isHoldBox = false) {
    // Determine which pre-rendered canvas to use
    const key = isHoldBox ? `${piece.type}-hold` : `${piece.type}-next`;
    const preRenderedCanvas = preRenderedMiniPieces.get(key);

    if (preRenderedCanvas) {
        ctx.drawImage(preRenderedCanvas, boxX, boxY, boxW, boxH);
    } else {
        console.warn(`Pre-rendered canvas for ${key} not found.`);
        // Fallback to original drawing logic if for some reason pre-rendered canvas is not available
        const shape = piece.shape[0];
        const miniCellSize = Math.round(boxW / CONFIG.ui.miniPieceCellCount);
        const pieceMinX = Math.min(...shape.map(p => p[0]));
        const pieceMinY = Math.min(...shape.map(p => p[1]));
        const pieceMaxX = Math.max(...shape.map(p => p[0]));
        const pieceMaxY = Math.max(...shape.map(p => p[1]));
        const pieceRenderWidth = (pieceMaxX - pieceMinX + 1) * miniCellSize;
        const pieceRenderHeight = (pieceMaxY - pieceMinY + 1) * miniCellSize;
        const offsetX = Math.round(boxX + (boxW - pieceRenderWidth) / 2 - pieceMinX * miniCellSize);
        const offsetY = Math.round(boxY + (boxH - pieceRenderHeight) / 2 - pieceMinY * miniCellSize);

        shape.forEach(([x, y]) => {
            drawBlock(ctx, offsetX + x * miniCellSize, offsetY + y * miniCellSize, piece.type, miniCellSize);
        });
    }
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

function prerenderAllMiniPieces() {
    const tetrominoTypes = Object.keys(CONFIG.TETROMINOES);
    tetrominoTypes.forEach(type => {
        // Adjust for titleReserveHeight when prerendering next pieces
        const titleReserveHeight = CELL_SIZE * (CONFIG.ui.titledBoxTitleOffset + CONFIG.ui.titledBoxFontScale * 0.5);
        const nextPieceBoxHeight = (NEXT_BOX_HEIGHT - titleReserveHeight) / CONFIG.game.nextPiecesCount;

        const holdCanvas = createOffscreenMiniPieceCanvas(type, HOLD_BOX_WIDTH, HOLD_BOX_HEIGHT);
        const nextCanvas = createOffscreenMiniPieceCanvas(type, NEXT_BOX_WIDTH, nextPieceBoxHeight); 
        preRenderedMiniPieces.set(`${type}-hold`, holdCanvas);
        preRenderedMiniPieces.set(`${type}-next`, nextCanvas);
    });
}

function createOffscreenMiniPieceCanvas(pieceType, boxW, boxH) {
    const canvas = document.createElement('canvas');
    canvas.width = boxW;
    canvas.height = boxH;
    const ctx = canvas.getContext('2d');

    const piece = {
        shape: CONFIG.TETROMINOES[pieceType].shape[0], // Use the first rotation for mini-pieces
        type: pieceType
    };

    const shape = piece.shape;
    const miniCellSize = Math.round(boxW / CONFIG.ui.miniPieceCellCount);

    const pieceMinX = Math.min(...shape.map(p => p[0]));
    const pieceMinY = Math.min(...shape.map(p => p[1]));
    const pieceMaxX = Math.max(...shape.map(p => p[0]));
    const pieceMaxY = Math.max(...shape.map(p => p[1]));

    const pieceRenderWidth = (pieceMaxX - pieceMinX + 1) * miniCellSize;
    const pieceRenderHeight = (pieceMaxY - pieceMinY + 1) * miniCellSize;

    // Calculate offsets for centering within its own canvas
    const offsetX = Math.round((boxW - pieceRenderWidth) / 2 - pieceMinX * miniCellSize);
    const offsetY = Math.round((boxH - pieceRenderHeight) / 2 - pieceMinY * miniCellSize);

    shape.forEach(([x, y]) => {
        drawBlock(ctx, offsetX + x * miniCellSize, offsetY + y * miniCellSize, piece.type, miniCellSize);
    });
    return canvas;
}

export function tetrominoTypeToIndex(type) {
    const types = Object.keys(CONFIG.TETROMINOES);
    return types.indexOf(type);
}

function drawBlock(ctx, x, y, color, size) {
    const typeIndex = tetrominoTypeToIndex(color);
    const isGarbage = color === 'G';
    const baseColor = isGarbage ? CONFIG.colors.garbage : (CONFIG.colors.tetromino[typeIndex + 1] || "#808080");
    if (!baseColor) return;

    if (isGarbage) {
        // Draw garbage blocks smaller
        const border = size * 0.15;
        ctx.fillStyle = '#222';
        ctx.fillRect(x, y, size, size);
        ctx.fillStyle = baseColor;
        ctx.fillRect(x + border, y + border, size - border * 2, size - border * 2);
    } else {
        ctx.fillStyle = "#111";
        ctx.fillRect(x, y, size, size);
        
        ctx.fillStyle = baseColor;
        const innerGap = size * 0.05;
        ctx.fillRect(x + innerGap, y + innerGap, size - innerGap * 2, size - innerGap * 2);

        ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
        ctx.fillRect(x + innerGap, y + innerGap, size - innerGap * 2, (size - innerGap * 2) * 0.2);
    }
}