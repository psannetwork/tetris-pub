import { CONFIG } from '../core/config.js';
import { addTextEffect } from '../engine/effects.js';
import { getMainBoardOffset } from '../engine/draw.js'; // Import getMainBoardOffset

// --- DOM Elements ---
const gameEndOverlay = document.getElementById('game-end-overlay');
const gameEndTitle = document.getElementById('game-end-title');
const countdownOverlay = document.getElementById('countdown-overlay');
const rankingListContainer = document.getElementById('final-ranking-list');

// --- Rating State ---
let lastRatingUpdate = null;

export function setLastRatingUpdate(update) {
    lastRatingUpdate = update;
    // リザルト画面が既に表示されている場合は、即座にアニメーションを開始する
    if (gameEndOverlay && gameEndOverlay.classList.contains('visible')) {
        animateRatingChange();
    }
}

function animateRatingChange() {
    const ratingDisplay = document.getElementById('rating-change-display');
    if (!ratingDisplay || !lastRatingUpdate) return;

    ratingDisplay.style.display = 'flex';
    const { change, newRating } = lastRatingUpdate;
    const oldRating = newRating - change;
    
    const oldValEl = document.getElementById('rating-old-value');
    const newValEl = document.getElementById('rating-new-value');
    const diffValEl = document.getElementById('rating-diff-value');

    oldValEl.textContent = oldRating;
    diffValEl.textContent = (change >= 0 ? `+${change}` : change);
    diffValEl.className = 'rating-diff-value ' + (change >= 0 ? 'plus' : 'minus');

    // アニメーション
    let current = oldRating;
    const duration = 1500; // 少し長めの1.5秒
    const startTime = performance.now();

    const animate = (now) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeOut = 1 - Math.pow(1 - progress, 4); // より滑らかなイージング
        
        const displayValue = Math.floor(oldRating + (newRating - oldRating) * easeOut);
        newValEl.textContent = displayValue;

        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            newValEl.textContent = newRating;
        }
    };
    requestAnimationFrame(animate);
    
    // 表示後はクリア
    lastRatingUpdate = null;
}

/**
 * Controls the game over/win screen overlay.
 */
export function showGameEndScreen(title, isWin, rankingMap, myId, statsMap = {}) {
  if (gameEndOverlay && gameEndTitle && rankingListContainer) {
    gameEndTitle.textContent = title;
    gameEndTitle.style.color = isWin ? CONFIG.colors.win : CONFIG.colors.lose;

    // レート情報の表示（既に届いている場合）
    if (lastRatingUpdate) {
        animateRatingChange();
    } else {
        document.getElementById('rating-change-display').style.display = 'none';
    }

    rankingListContainer.innerHTML = '';

    // 3. Create a comprehensive list of all players involved.
    if (rankingMap) {
      const allPlayerIds = new Set([...Object.keys(rankingMap), ...Object.keys(statsMap)]);
      const playerList = Array.from(allPlayerIds).map(userId => ({
        userId,
        rank: rankingMap[userId] ?? null,
        stats: statsMap[userId] || { score: 0, lines: 0 },
      }));

      // 4. Sort the list: playing players first, then by rank.
      playerList.sort((a, b) => {
        if (a.rank === null && b.rank !== null) return -1; // a is playing, b is not
        if (a.rank !== null && b.rank === null) return 1;  // b is playing, a is not
        if (a.rank === null && b.rank === null) return 0;  // both are playing
        return a.rank - b.rank; // both are ranked
      });

      // 5. Create and append new ranking cards
      for (const player of playerList) {
        const { userId, rank, stats } = player;
        const isMe = userId === myId;
        const displayName = isMe ? 'YOU' : `${userId.substring(0, 6)}`;
        
        const rankText = rank === null ? 'LIVE' : `${rank}`;

        const card = document.createElement('div');
        card.className = 'rank-card';
        if (isMe) card.classList.add('my-rank');
        if (rank !== null) card.setAttribute('data-rank', rank);

        card.innerHTML = `
          <span class="rank-position">${rankText}</span>
          <span class="rank-player-name">${displayName}</span>
          <span class="rank-stats">${stats.score} / ${stats.lines}L</span>
        `;
        rankingListContainer.appendChild(card);
      }
    }

    // 6. Show the overlay
    gameEndOverlay.classList.add('visible');
    // NEW: Enable spectate button if it exists
    const spectateBtn = document.getElementById('spectate-button');
    if (spectateBtn) {
        spectateBtn.style.display = 'block';
    }
  }
}

export function showPerfectClearMessage() {
      addTextEffect('PERFECT CLEAR', { style: 'quad', duration: 2000 });}

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