// ★ Perfect 用エフェクト変数 ★
let perfectEffect = null;

// ★ 新しい Perfect エフェクトをトリガーする関数 ★
function triggerPerfectEffect(x, y) {
  perfectEffect = { type: "perfect", x: x, y: y, startTime: Date.now(), duration: CONFIG.effects.perfectEffectDuration };
}

// ★ 新しいスコア計算関数 ★
function calculateScore({ lines, tSpin, isMini, ren, b2b, perfectClear }) {
  let baseScore = 0;
  let additional = 0;
  if (tSpin) {
    if (lines === 0) baseScore = CONFIG.scoring.tspin;
    else if (lines === 1) baseScore = CONFIG.scoring.tspinSingle;
    else if (lines === 2) baseScore = CONFIG.scoring.tspinDouble;
    else if (lines === 3) baseScore = CONFIG.scoring.tspinTriple;
  } else if (isMini) {
    baseScore = (lines === 1 ? CONFIG.scoring.single : 0);
    additional += CONFIG.scoring.tspinMini;
  } else {
    switch (lines) {
      case 1:
        baseScore = CONFIG.scoring.single;
        break;
      case 2:
        baseScore = CONFIG.scoring.double;
        break;
      case 3:
        baseScore = CONFIG.scoring.triple;
        break;
      case 4:
        baseScore = CONFIG.scoring.tetris;
        break;
    }
  }
  const renBonus = Math.min(50 * ren, 1000);
  const multiplier = (b2b ? 1.5 : 1);
  let scoreGained = Math.floor((baseScore + renBonus) * multiplier + additional);
  
  // Perfect Clear の場合、さらにボーナスを加算
  if (perfectClear) {
    switch (lines) {
      case 1:
        scoreGained += CONFIG.scoring.perfectClearSingle;
        break;
      case 2:
        scoreGained += CONFIG.scoring.perfectClearDouble;
        break;
      case 3:
        scoreGained += CONFIG.scoring.perfectClearTriple;
        break;
      case 4:
        scoreGained += CONFIG.scoring.perfectClearTetris;
        break;
    }
  }
  return scoreGained;
}

// ★ モジュールシステムを利用している場合はエクスポート ★
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    calculateScore,
    triggerPerfectEffect,
    perfectEffect
  };
}