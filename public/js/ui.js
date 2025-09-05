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
export function showGameEndScreen(title, isWin, rankingMap, myId) {
  if (gameEndOverlay && gameEndMessage) {
    let fullMessage = `<h1 style="color: ${isWin ? CONFIG.colors.win : CONFIG.colors.lose};">${title}</h1>`;

    if (rankingMap) {
      const sortedRanks = Object.entries(rankingMap)
        .filter(([, rank]) => rank !== null) // Filter out any players who might not have a rank yet
        .sort(([, rankA], [, rankB]) => rankA - rankB);

      fullMessage += '<div class="final-ranks"><h2>Results</h2><ol>';
      for (const [userId, rank] of sortedRanks) {
        const isMe = userId === myId;
        // Simplified display name
        const displayName = isMe ? 'You' : `Player...${userId.substring(userId.length - 4)}`;
        const myRankClass = isMe ? 'my-rank' : '';
        fullMessage += `<li class="${myRankClass}"><b>#${rank}</b> - ${displayName}</li>`;
      }
      fullMessage += '</ol></div>';
    }

    gameEndMessage.innerHTML = fullMessage;
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
            countdownOverlay.style.position = 'absolute';
            countdownOverlay.style.top = '50%';
            countdownOverlay.style.left = '50%';
            countdownOverlay.style.transform = 'translate(-50%, -50%)';
            countdownOverlay.style.backgroundColor = 'rgba(0,0,0,0)'; // Fully transparent background
            countdownOverlay.style.zIndex = '1000'; // Ensure it's on top
            countdownOverlay.style.fontSize = '5em'; // Make the text large
            countdownOverlay.style.color = 'white'; // Ensure text is visible
        }
    }
}