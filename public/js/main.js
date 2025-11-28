import { setGameGetStatsCallback } from './game.js';
import { setOnlineGetStatsCallback } from './online.js';
import { CONFIG } from './config.js';
import { 
    gameState, setGameState, resetGame,
    currentPiece, level, isValidPosition, lockPiece, movePiece, LOCK_DELAY,
    board, score, linesCleared
} from './game.js';
import { drawGame, drawUI, setupCanvases } from './draw.js';
import { updateEffects, initEffects } from './effects.js';
import { handleInput } from './input.js';
import { sendBoardStatus, connectToServer, startMatching, currentCountdown, startAnimationIfNeeded, socket, setManualDisconnect, initializeSocket } from './online.js'; // Added socket
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

// --- Helper function to set button state ---
function setButtonState(button, enabled) {
    button.disabled = !enabled;
    if (enabled) {
        button.classList.remove('disabled');
    } else {
        button.classList.add('disabled');
    }
}

// --- Event Listeners ---
startButton.onclick = () => {
    lobbyOverlay.classList.add('hidden');
    startMatching();
    setButtonState(startButton, false); // Disable start button after click
};

retryButton.onclick = () => {
    gameEndOverlay.classList.remove('visible');
    setManualDisconnect(true);
    initializeSocket();
    connectToServer();

    setButtonState(retryButton, false); // Disable retry button after click
    setButtonState(lobbyButton, false); // Disable lobby button after click
    setButtonState(startButton, false); // Disable start button
};

lobbyButton.onclick = () => {
    gameEndOverlay.classList.remove('visible');
    lobbyOverlay.classList.remove('hidden');
    setGameState('LOBBY');
    resetGame(); 
    setButtonState(lobbyButton, false); // Disable lobby button after click
    setButtonState(retryButton, false); // Disable retry button
    setButtonState(startButton, true); // Enable start button for new game
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

    // Update button states based on game state
    updateButtonStates();

    // Drawing is now separated and happens every frame regardless of state
    drawGame();
    drawUI();
    startAnimationIfNeeded();

    requestAnimationFrame(update);
}

// --- Function to update button states based on game state ---
function updateButtonStates() {
    if (gameState === 'LOBBY') {
        setButtonState(startButton, true);
        setButtonState(retryButton, false);
        setButtonState(lobbyButton, false);
    } else if (gameState === 'PLAYING') {
        setButtonState(startButton, false);
        setButtonState(retryButton, false);
        setButtonState(lobbyButton, false);
    } else if (gameState === 'GAME_OVER') {
        setButtonState(startButton, false);
        setButtonState(retryButton, true);
        setButtonState(lobbyButton, true);
    }
}

// --- Initialization ---
function init() {
    setGameGetStatsCallback(getStats);
    setOnlineGetStatsCallback(getStats);
    setupCanvases();
    initializeSocket();
    connectToServer();
    gameEndOverlay.classList.remove('visible');
    setGameState('LOBBY');
    resetGame();
    lastTime = performance.now();
    update();
    updateButtonStates(); // Initial button state update
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