import { CONFIG } from './config.js';
import { 
    gameState, setGameState, resetGame,
    currentPiece, level, isValidPosition, lockPiece, movePiece, LOCK_DELAY,
    board, score, linesCleared
} from './game.js';
import { drawGame, drawUI, setupCanvases } from './draw.js';
import { updateEffects } from './effects.js';
import { handleInput } from './input.js';
import { sendBoardStatus, connectToServer, startMatching, currentCountdown } from './online.js';
import { showCountdown } from './ui.js';

// --- DOM Elements ---
const lobbyOverlay = document.getElementById('lobby-overlay');
const startButton = document.getElementById('start-button');
const gameEndOverlay = document.getElementById('game-end-overlay');
const retryButton = document.getElementById('retry-button');
const lobbyButton = document.getElementById('lobby-button');

// --- Stats State ---
let lastTime = 0;
let dropCounter = 0;
let gameStartTime = 0;
let keyPresses = 0;
let piecesPlaced = 0;
let pps = '0.00';
let apm = '0.0';
let time = '00:00';

// --- Event Listeners ---
startButton.onclick = () => {
    lobbyOverlay.classList.add('hidden');
    startMatching();
};

retryButton.onclick = () => {
    gameEndOverlay.classList.remove('visible');
    resetGame();
    startMatching();
};

lobbyButton.onclick = () => {
    gameEndOverlay.classList.remove('visible');
    lobbyOverlay.classList.remove('hidden');
    setGameState('LOBBY');
    resetGame(); 
};

// --- Game Loop ---
function update(now = performance.now()) {
    if (gameState === 'PLAYING') {
        if (gameStartTime === 0) {
            gameStartTime = now;
        }
        handleInput();

        const delta = now - lastTime;
        lastTime = now;

        dropCounter += delta;
        if (dropCounter > CONFIG.dropInterval / level) {
            movePiece({ x: 0, y: 1 });
            dropCounter = 0;
        }

        if (currentPiece && !isValidPosition(currentPiece, 0, 1)) {
            currentPiece.lockDelay += delta;
            if (currentPiece.lockDelay >= LOCK_DELAY) {
                lockPiece();
                piecesPlaced++; // Increment pieces placed on lock
            }
        }
        
        updateEffects();
        sendBoardStatus(board, currentPiece);

        // Calculate stats
        const elapsedTime = (now - gameStartTime) / 1000;
        const minutes = Math.floor(elapsedTime / 60).toString().padStart(2, '0');
        const seconds = Math.floor(elapsedTime % 60).toString().padStart(2, '0');
        time = `${minutes}:${seconds}`;
        pps = (piecesPlaced / elapsedTime || 0).toFixed(2);
        apm = ((keyPresses * 60) / elapsedTime || 0).toFixed(1);

    } else {
        // Reset stats when not playing
        gameStartTime = 0;
        piecesPlaced = 0;
        keyPresses = 0;
    }

    // Drawing is now separated and happens every frame regardless of state
    drawGame();
    drawUI();

    requestAnimationFrame(update);
}

// --- Initialization ---
function init() {
    setupCanvases();
    connectToServer();
    gameEndOverlay.classList.remove('visible');
    setGameState('LOBBY');
    resetGame();
    lastTime = performance.now();
    update();
}

// --- Public Functions ---

export function incrementKeyPresses() {
    keyPresses++;
}

export function getStats() {
    return { 
        time,
        lines: linesCleared,
        level,
        score,
        apm,
        pps
    };
}

init();