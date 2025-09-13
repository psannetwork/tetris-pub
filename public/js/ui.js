import { CONFIG } from './config.js';

// --- DOM Elements ---
const gameEndOverlay = document.getElementById('game-end-overlay');
const gameEndMessage = document.getElementById('game-end-message');
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
  if (gameEndOverlay && gameEndMessage && rankingListContainer) {
    // 1. Set title
    gameEndMessage.innerHTML = `<h1 style="color: ${isWin ? CONFIG.colors.win : CONFIG.colors.lose};">${title}</h1>`;

    // 2. Clear previous ranking
    rankingListContainer.innerHTML = '';

    // 3. Create and append new ranking
    if (rankingMap) {
      const sortedRanks = Object.entries(rankingMap)
        .filter(([, rank]) => rank !== null)
        .sort(([, rankA], [, rankB]) => rankA - rankB);

      for (const [userId, rank] of sortedRanks) {
        const isMe = userId === myId;
        const displayName = isMe ? 'You' : `Player...${userId.substring(userId.length - 4)}`;
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
  }
}

export function showPerfectClearMessage() {
  console.log("Perfect Clear!");
  // TODO: Implement actual UI for perfect clear message
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

/**
 * Hides the game end screen.
 */
export function hideGameEndScreen() {
  if (gameEndOverlay) {
    gameEndOverlay.classList.remove('visible');
  }
}