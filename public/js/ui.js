import { CONFIG } from './config.js';
import { addTextEffect } from './effects.js';
import { getMainBoardOffset } from './draw.js'; // Import getMainBoardOffset

// --- DOM Elements ---
const gameEndOverlay = document.getElementById('game-end-overlay');
const gameEndTitle = document.getElementById('game-end-title');
const countdownOverlay = document.getElementById('countdown-overlay');
const rankingListContainer = document.getElementById('final-ranking-list');

/**
 * Controls the game over/win screen overlay.
 * @param {string} title - The message to display (e.g., "You Win!").
 * @param {boolean} isWin - True if it's a win screen.
 * @param {object} rankingMap - A map of userId to their final rank.
 * @param {string} myId - The current user's ID.
 * @param {object} statsMap - A map of userId to their game stats.
 */
export function showGameEndScreen(title, isWin, rankingMap, myId, statsMap = {}) {
  if (gameEndOverlay && gameEndTitle && rankingListContainer) {
    // 1. Set title
    gameEndTitle.textContent = title;
    gameEndTitle.style.color = isWin ? CONFIG.colors.win : CONFIG.colors.lose;

    // 2. Clear previous ranking
    rankingListContainer.innerHTML = '';

    // 3. Create and append new ranking
    if (rankingMap) {
      const sortedRanks = Object.entries(rankingMap)
        .filter(([, rank]) => rank !== null)
        .sort(([, rankA], [, rankB]) => rankA - rankB);

      for (const [userId, rank] of sortedRanks) {
        const isMe = userId === myId;
        const displayName = isMe ? 'You' : `Player (${userId.substring(0, 4)}...)`;
        const userStats = statsMap[userId] || { score: 0, lines: 0 };

        const card = document.createElement('div');
        card.className = 'rank-card';
        if (isMe) {
          card.classList.add('my-rank');
        }

        card.innerHTML = `
          <div class="rank-position">#${rank}</div>
          <div class="rank-player-name">${displayName}</div>
          <div class="rank-stats">
            <span>Score: ${userStats.score}</span>
            <span>Lines: ${userStats.lines}</span>
          </div>
        `;
        rankingListContainer.appendChild(card);
      }
    }

    // 4. Show the overlay
    gameEndOverlay.classList.add('visible');
    // NEW: Enable spectate button if it exists
    const spectateBtn = document.getElementById('spectate-button');
    if (spectateBtn) {
        spectateBtn.style.display = 'block';
    }
  }
}

export function showPerfectClearMessage() {
  addTextEffect('PERFECT CLEAR', { style: 'tetris', duration: 2000 });
}

/**
 * Updates the countdown state (now handled in canvas drawing).
 * @param {number|string} count - The countdown number or text to display.
 */
export function showCountdown(count) {
    // Countdown is now handled in canvas drawing, so we won't update HTML elements here
    // This function exists for compatibility but does not update HTML elements
    // The actual countdown display is handled by drawCountdown in draw.js
}

/**
 * Hides the game end screen.
 */
export function hideGameEndScreen() {
  if (gameEndOverlay) {
    gameEndOverlay.classList.remove('visible');
  }
}