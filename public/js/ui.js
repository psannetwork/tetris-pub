import { CONFIG } from './config.js';

// --- DOM Elements ---
const gameEndOverlay = document.getElementById('game-end-overlay');
const gameEndMessage = document.getElementById('game-end-message');
const countdownOverlay = document.getElementById('countdown-overlay');

/**
 * Controls the game over/win screen overlay.
 * @param {string} message - The message to display (e.g., "Game Over").
 * @param {boolean} isWin - True if it's a win screen.
 */
export function showGameEndScreen(message, isWin = false) {
  if (gameEndOverlay && gameEndMessage) {
      gameEndMessage.textContent = message;
      gameEndMessage.style.color = isWin ? CONFIG.colors.win : CONFIG.colors.lose;
      gameEndOverlay.classList.add('visible');
  }
}

/**
 * Displays the countdown overlay.
 * @param {number|string} count - The countdown number or text to display.
 */
export function showCountdown(count) {
    if (countdownOverlay) {
        if (count === null || count === '' || count === 0) {
            countdownOverlay.style.display = 'none';
        } else {
            countdownOverlay.textContent = count;
            countdownOverlay.style.display = 'flex';
        }
    }
}