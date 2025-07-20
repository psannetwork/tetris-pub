"use strict";

const io = require("socket.io-client");
const fs = require("fs");
const path = require("path");

// 自動再マッチングを行うかどうかのフラグ（true: 再挑戦する、false: 再挑戦しない）
const AUTO_REMATCH = true;

// =====================
// ■ Bot/AI 設定
// =====================

// 穴のペナルティを強化するため、weightHoles, weightBottomHoles を大きめの負数に設定
const BASE_AI_PARAMETERS = {
  // 【1】 火力およびライン消去の評価（生存優先のため、ここでは主に参考値）
  weightLineClear: 1.0,      // その手で消せるライン数（1～2ラインクリア評価）
  weightTetris: 8.0,         // 4ライン消し（Tetris）の大幅ボーナス
  weightTSpin: 2.0,          // T‑Spin/T‑Spin Mini成立時の加点
  weightCombo: 3.5,          // コンボ／Ren連鎖の持続性の評価

  // 【2】 盤面安定性・リスク管理（生存のための重要評価軸）
  weightAggregateHeight: -0.71, // 各列の高さの合計（低いほうが有利）
  weightBumpiness: -0.18,       // 隣接列間の段差（凹凸）のペナルティ
  weightHoles: -1.8,            // 盤面全体の穴の数へのペナルティ（強化）
  weightBottomHoles: -2.0,      // 盤面下部の穴への追加ペナルティ（強化）
  weightUpperRisk: -1.0,        // 盤面上部ブロックに対するリスクペナルティ

  // 【3】 戦略技術・先読みと柔軟性（必要に応じて）
  weightMiddleOpen: 1.9,        // 中央部のオープンスペース評価
  weightHoldFlexibility: 1.0,   // ホールド活用の柔軟性評価
  weightNextPiece: 1.5,         // 次ピース連携評価

  // 【4】 位置配置の最適化（配置優先の評価）
  weightLowerPlacement: 0.7,    // 下部への配置ボーナス
  weightUpperPlacement: -0.5,   // 上部への配置ペナルティ
  weightEdgePenalty: -0.2,      // エッジ配置のペナルティ

  // その他
  lineClearBonus: 1.0,          // ライン消去時の追加ボーナス
  weightGarbage: 10             // ガーベージ送信用の基本重み
};

const BOT_COUNT = 30;
const BOT_MOVE_DELAY = 400;
const MOVE_ANIMATION_DELAY = 100;
const SOFT_DROP_DELAY = 100;

const SERVER_URL = "https://tetris.psannetwork.net/";
const dataDir = "./data";
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}

// =====================
// ■ テトリミノ定義＆ SRS キックテーブル
// =====================
const tetrominoes = {
  I: { base: [[0, 0], [1, 0], [2, 0], [3, 0]], spawn: { x: 3, y: 0 } },
  J: { base: [[0, 0], [0, 1], [1, 1], [2, 1]], spawn: { x: 3, y: 0 } },
  L: { base: [[2, 0], [0, 1], [1, 1], [2, 1]], spawn: { x: 3, y: 0 } },
  O: { base: [[0, 0], [1, 0], [0, 1], [1, 1]], spawn: { x: 4, y: 0 } },
  S: { base: [[1, 0], [2, 0], [0, 1], [1, 1]], spawn: { x: 3, y: 0 } },
  T: { base: [[1, 0], [0, 1], [1, 1], [2, 1]], spawn: { x: 3, y: 0 } },
  Z: { base: [[0, 0], [1, 0], [1, 1], [2, 1]], spawn: { x: 3, y: 0 } }
};

const srsKick = {
  normal: {
    "0_L": { newOrientation: 3, offsets: [{ x: 1, y: 0 }, { x: 1, y: -1 }, { x: 0, y: 2 }, { x: 1, y: 2 }] },
    "0_R": { newOrientation: 1, offsets: [{ x: -1, y: 0 }, { x: -1, y: -1 }, { x: 0, y: 2 }, { x: -1, y: 2 }] },
    "90_L": { newOrientation: 0, offsets: [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: -2 }, { x: 1, y: -2 }] },
    "90_R": { newOrientation: 2, offsets: [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: -2 }, { x: 1, y: -2 }] },
    "180_L": { newOrientation: 1, offsets: [{ x: -1, y: 0 }, { x: -1, y: -1 }, { x: 0, y: 2 }, { x: -1, y: 2 }] },
    "180_R": { newOrientation: 3, offsets: [{ x: 1, y: 0 }, { x: 1, y: -1 }, { x: 0, y: 2 }, { x: 1, y: 2 }] },
    "270_L": { newOrientation: 2, offsets: [{ x: -1, y: 0 }, { x: -1, y: 1 }, { x: 0, y: -2 }, { x: -1, y: -2 }] },
    "270_R": { newOrientation: 0, offsets: [{ x: -1, y: 0 }, { x: -1, y: 1 }, { x: 0, y: -2 }, { x: -1, y: -2 }] }
  },
  I: {
    "0_L": { newOrientation: 3, offsets: [{ x: -1, y: 0 }, { x: 2, y: 0 }, { x: -1, y: -2 }, { x: 2, y: 1 }] },
    "0_R": { newOrientation: 1, offsets: [{ x: -2, y: 0 }, { x: 1, y: 0 }, { x: -2, y: 1 }, { x: 1, y: -2 }] },
    "90_L": { newOrientation: 0, offsets: [{ x: 2, y: 0 }, { x: -1, y: 0 }, { x: 2, y: -1 }, { x: -1, y: 2 }] },
    "90_R": { newOrientation: 2, offsets: [{ x: -1, y: 0 }, { x: 2, y: 0 }, { x: -1, y: -2 }, { x: 2, y: 1 }] },
    "180_L": { newOrientation: 1, offsets: [{ x: 1, y: 0 }, { x: -2, y: 0 }, { x: 1, y: 2 }, { x: -2, y: -1 }] },
    "180_R": { newOrientation: 3, offsets: [{ x: 2, y: 0 }, { x: -1, y: 0 }, { x: 2, y: -1 }, { x: -1, y: 2 }] },
    "270_L": { newOrientation: 2, offsets: [{ x: 1, y: 0 }, { x: -2, y: 0 }, { x: -2, y: 1 }, { x: 1, y: -2 }] },
    "270_R": { newOrientation: 0, offsets: [{ x: 2, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 2 }, { x: -2, y: -1 }] }
  }
};

// =====================
// ■ 盤面・ミノ操作の基本関数
// =====================
function createEmptyBoard() {
  const rows = 22, cols = 10;
  return Array.from({ length: rows }, () => new Array(cols).fill(0));
}

function getPieceBlocks(piece) {
  return piece.base.map(([x, y]) => {
    switch (piece.orientation) {
      case 0: return [x, y];
      case 1: return [y, -x];
      case 2: return [-x, -y];
      case 3: return [-y, x];
      default: return [x, y];
    }
  });
}

function isValidPosition(piece, board, dx, dy, candidateBlocks = null) {
  const blocks = candidateBlocks || getPieceBlocks(piece);
  for (let block of blocks) {
    const newX = piece.x + dx + block[0];
    const newY = piece.y + dy + block[1];
    if (newX < 0 || newX >= 10) return false;
    if (newY >= 22) return false;
    if (newY >= 0 && board[newY][newX] !== 0) return false;
  }
  return true;
}

function mergePiece(piece, board) {
  const blocks = getPieceBlocks(piece);
  for (let block of blocks) {
    const x = piece.x + block[0];
    const y = piece.y + block[1];
    if (y >= 0 && y < 22 && x >= 0 && x < 10) {
      board[y][x] = piece.type;
    }
  }
}

function clearLines(board) {
  let cleared = 0;
  for (let r = board.length - 1; r >= 0; r--) {
    if (board[r].every(cell => cell !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(10).fill(0));
      cleared++;
    }
  }
  return cleared;
}

function attemptRotation(piece, direction, board) {
  if (piece.type === "O") return true;
  const table = (piece.type === "I") ? srsKick.I : srsKick.normal;
  const key = `${piece.orientation}_${direction}`;
  if (!table[key]) return false;
  const { newOrientation, offsets } = table[key];
  const candidateBlocks = piece.base.map(([x, y]) => {
    switch (newOrientation) {
      case 0: return [x, y];
      case 1: return [y, -x];
      case 2: return [-x, -y];
      case 3: return [-y, x];
      default: return [x, y];
    }
  });
  for (let off of offsets) {
    const candidateX = piece.x + off.x;
    const candidateY = piece.y + off.y;
    if (isValidPosition({ ...piece, x: candidateX, y: candidateY, orientation: newOrientation },
                         board, 0, 0, candidateBlocks)) {
      piece.x = candidateX;
      piece.y = candidateY;
      piece.orientation = newOrientation;
      if (piece.type === "T") piece.rotated = true;
      return true;
    }
  }
  return false;
}

function hardDrop(piece, board) {
  while (isValidPosition(piece, board, 0, 1)) {
    piece.y++;
  }
  return piece;
}

async function softDropAnimation(piece, board, targetY) {
  while (piece.y < targetY && isValidPosition(piece, board, 0, 1)) {
    piece.y++;
    await delay(SOFT_DROP_DELAY);
  }
}

function spawnPiece() {
  const types = Object.keys(tetrominoes);
  const type = types[Math.floor(Math.random() * types.length)];
  const spawnPos = tetrominoes[type].spawn;
  return {
    type,
    base: tetrominoes[type].base,
    x: spawnPos.x,
    y: spawnPos.y,
    orientation: 0,
    isTSpin: false,
    rotated: false
  };
}

function drawBoard(fixedBoard, currentPiece) {
  const board = fixedBoard.map(row => row.slice());
  if (currentPiece) {
    const blocks = getPieceBlocks(currentPiece);
    for (let block of blocks) {
      const x = currentPiece.x + block[0];
      const y = currentPiece.y + block[1];
      if (y >= 0 && y < 22 && x >= 0 && x < 10) {
        board[y][x] = currentPiece.type;
      }
    }
  }
  return board;
}

// =====================
// ■ 危険判定（生存モード）
// =====================
// 盤面の上5行にブロックがある、または各列の高さの合計が50を超えていれば危険状態とする
function isDangerous(board) {
  for (let i = 0; i < 5; i++) {
    if (board[i].some(cell => cell !== 0)) return true;
  }
  let heights = getColumnHeights(board);
  let aggregate = heights.reduce((sum, h) => sum + h, 0);
  return aggregate > 50;
}

// =====================
// ■ 穴の横アクセス評価
// =====================
// 各縦列内で、ブロックの下にできた穴について左右隣が空いているかで評価
function computeHoleAccessibilityPenalty(board) {
  let penalty = 0;
  const rows = board.length;
  const cols = board[0].length;
  for (let j = 0; j < cols; j++) {
    let blockFound = false;
    for (let i = 0; i < rows; i++) {
      if (board[i][j] !== 0) {
        blockFound = true;
      } else if (blockFound && board[i][j] === 0) {
        let accessible = false;
        if (j > 0 && board[i][j - 1] === 0) accessible = true;
        if (j < cols - 1 && board[i][j + 1] === 0) accessible = true;
        if (!accessible) penalty += 1;
        else penalty -= 0.5;
      }
    }
  }
  return penalty;
}

// =====================
// ■ T‑Spin判定と火力算出
// =====================
function detectTSpin(piece, board) {
  if (piece.type !== "T" || !piece.rotated) return false;
  const cx = piece.x + 1, cy = piece.y + 1;
  let count = 0;
  const corners = [
    { x: cx - 1, y: cy - 1 },
    { x: cx + 1, y: cy - 1 },
    { x: cx - 1, y: cy + 1 },
    { x: cx + 1, y: cy + 1 }
  ];
  for (let corner of corners) {
    if (corner.x < 0 || corner.x >= 10 || corner.y < 0 || corner.y >= 22 ||
        board[corner.y][corner.x] !== 0) {
      count++;
    }
  }
  return count >= 3;
}

function computeMoveGarbage(piece, linesCleared, board, renChain, aiParameters) {
  let bonus = 0;
  const dangerous = isDangerous(board);
  const heights = getColumnHeights(board);
  const aggregate = heights.reduce((sum, h) => sum + h, 0);

  if (piece.type === "T" && detectTSpin(piece, board)) {
    bonus += aiParameters.weightTSpin * (dangerous ? 0.5 : 1);
  }
  if (linesCleared === 1) {
    bonus += aiParameters.weightLineClear;
  } else if (linesCleared === 2) {
    bonus += aiParameters.weightLineClear * 2;
  } else if (linesCleared === 3) {
    bonus += aiParameters.weightLineClear * 3;
  } else if (linesCleared === 4) {
    let tetrisBonus = aiParameters.weightTetris;
    if (dangerous) tetrisBonus *= 0.5;
    bonus += tetrisBonus;
  }
  if (renChain > 1) {
    let comboWeight = aiParameters.weightCombo;
    if (dangerous) comboWeight *= 0.5;
    bonus += comboWeight * (renChain - 1);
  }
  const isAllClear = board.every(row => row.every(cell => cell === 0));
  if (isAllClear) bonus += 10;
  return bonus;
}

// =====================
// ■ 盤面評価（安定性・リスク・戦略・配置最適化）
// =====================
function getColumnHeights(board) {
  const cols = board[0].length;
  let heights = new Array(cols).fill(0);
  for (let j = 0; j < cols; j++) {
    for (let i = 0; i < board.length; i++) {
      if (board[i][j] !== 0) {
        heights[j] = board.length - i;
        break;
      }
    }
  }
  return heights;
}

function computeBumpiness(heights) {
  let bumpiness = 0;
  for (let j = 0; j < heights.length - 1; j++) {
    bumpiness += Math.abs(heights[j] - heights[j + 1]);
  }
  return bumpiness;
}

function computeHoles(board) {
  const cols = board[0].length;
  let holes = 0;
  for (let j = 0; j < cols; j++) {
    let blockFound = false;
    for (let i = 0; i < board.length; i++) {
      if (board[i][j] !== 0) blockFound = true;
      else if (blockFound && board[i][j] === 0) holes++;
    }
  }
  return holes;
}

function computeBottomHoles(board) {
  let bottomHoles = 0;
  const startRow = board.length - 5;
  const cols = board[0].length;
  for (let i = startRow; i < board.length; i++) {
    for (let j = 0; j < cols; j++) {
      if (board[i][j] === 0) {
        let blockAbove = false;
        for (let k = 0; k < i; k++) {
          if (board[k][j] !== 0) { blockAbove = true; break; }
        }
        if (blockAbove) bottomHoles++;
      }
    }
  }
  return bottomHoles;
}

function computeUpperRisk(board) {
  let risk = 0;
  const upperRows = 4;
  for (let i = 0; i < upperRows; i++) {
    for (let j = 0; j < board[0].length; j++) {
      if (board[i][j] !== 0) {
        risk += (upperRows - i);
      }
    }
  }
  return risk;
}

function evaluateMiddleOpen(board, parameters) {
  if (isDangerous(board)) return 0;
  let bonus = 0;
  const centerCols = [4, 5];
  for (let i = 0; i < Math.floor(board.length / 2); i++) {
    for (let j of centerCols) {
      if (board[i][j] === 0) bonus += parameters.weightMiddleOpen;
    }
  }
  return bonus;
}

function computePlacementBonus(placement, parameters) {
  let bonus = 0;
  const blocks = getPieceBlocks(placement);
  let totalRow = 0, count = 0;
  for (let block of blocks) {
    const row = placement.y + block[1];
    totalRow += row;
    count++;
    if (row < 4) bonus += parameters.weightUpperPlacement;
    const col = placement.x + block[0];
    if (col === 0 || col === 9) bonus += parameters.weightEdgePenalty;
  }
  const avgRow = totalRow / count;
  bonus += parameters.weightLowerPlacement * avgRow;
  return bonus;
}

function evaluateBoard(board, parameters) {
  const dangerous = isDangerous(board);
  const heights = getColumnHeights(board);
  const aggregateHeight = heights.reduce((sum, h) => sum + h, 0);
  const bumpiness = computeBumpiness(heights);
  const holes = computeHoles(board);
  const bottomHoles = computeBottomHoles(board);
  const upperRisk = computeUpperRisk(board);
  const maxHeight = Math.max(...heights);
  let score = 0;
  
  if (dangerous) {
    score += parameters.weightAggregateHeight * aggregateHeight * 1.5;
    score += parameters.weightBumpiness * bumpiness * 1.5;
    score += parameters.weightHoles * holes * 2;
    score += parameters.weightBottomHoles * bottomHoles * 2;
    score += parameters.weightUpperRisk * upperRisk * 2;
    score -= 0.5 * maxHeight;
  } else {
    score += parameters.weightAggregateHeight * aggregateHeight;
    score += parameters.weightBumpiness * bumpiness;
    score += parameters.weightHoles * holes;
    score += parameters.weightBottomHoles * bottomHoles;
    score += parameters.weightUpperRisk * upperRisk;
    score += evaluateMiddleOpen(board, parameters);
    score += parameters.weightNextPiece * countTSpinOpportunities(board);
  }
  // 追加：穴の横アクセス評価を反映
  score += computeHoleAccessibilityPenalty(board);
  return score;
}

function countTSpinOpportunities(board) {
  let count = 0;
  const Tpiece = { type: "T", base: tetrominoes["T"].base, x: tetrominoes["T"].spawn.x, y: tetrominoes["T"].spawn.y, orientation: 0, rotated: false };
  for (let orientation = 0; orientation < 4; orientation++) {
    let testPiece = { ...Tpiece, orientation };
    for (let x = -3; x < 10; x++) {
      let candidate = { ...testPiece, x: x, y: testPiece.y };
      if (!isValidPosition(candidate, board, 0, 0)) continue;
      let finalCandidate = hardDrop({ ...candidate }, board);
      if (detectTSpin(finalCandidate, board)) count++;
    }
  }
  return count;
}

// =====================
// ■ 候補手探索と最善手選択
// =====================
function getAllPlacements(board, piece) {
  const placements = [];
  for (let orientation = 0; orientation < 4; orientation++) {
    const testPiece = { ...piece, orientation, rotated: (orientation !== piece.orientation) };
    for (let x = -3; x < 10; x++) {
      let candidate = { ...testPiece, x: x, y: testPiece.y };
      if (!isValidPosition(candidate, board, 0, 0)) continue;
      let finalCandidate = hardDrop({ ...candidate }, board);
      finalCandidate.tspinBonus = (finalCandidate.type === "T" && detectTSpin(finalCandidate, board)) ? 2 : 0;
      placements.push(finalCandidate);
    }
  }
  return placements;
}

function findBestMove(board, currentPiece, aiParameters, socket, botStrength) {
  const placements = getAllPlacements(board, currentPiece);
  if (placements.length === 0) return null;
  let bestScore = -Infinity, bestMove = null;
  const FIREPOWER_THRESHOLD = 20;
  const currentAttack = socket.gameStats.totalAttack;
  
  for (let placement of placements) {
    const simulatedBoard = board.map(row => row.slice());
    mergePiece(placement, simulatedBoard);
    const linesCleared = clearLines(simulatedBoard);
    placement.isTSpin = (placement.type === "T" && detectTSpin(placement, simulatedBoard));
    const garbagePotential = computeMoveGarbage(placement, linesCleared, simulatedBoard, socket.gameStats.renChain, aiParameters);
    let dynamicGarbageWeight = aiParameters.weightGarbage;
    if (currentAttack > FIREPOWER_THRESHOLD) dynamicGarbageWeight *= 2;
    else dynamicGarbageWeight *= 0.5;
    let score = evaluateBoard(simulatedBoard, aiParameters) + (garbagePotential * dynamicGarbageWeight);
    score += computePlacementBonus(placement, aiParameters);
    if (placement.type === "T" && placement.isTSpin) score += placement.tspinBonus;
    if (socket.lastMove && placement.x === socket.lastMove.x && placement.orientation === socket.lastMove.orientation) {
      score -= aiParameters.weightCombo;
    }
    if (score > bestScore) {
      bestScore = score;
      bestMove = placement;
    }
  }
  
  if (bestMove) socket.lastMove = { x: bestMove.x, orientation: bestMove.orientation };
  let errorChance = (100 - botStrength) / 400;
  if (Math.random() < errorChance) bestMove = placements[Math.floor(Math.random() * placements.length)];
  return bestMove;
}

// =====================
// ■ 学習処理とパラメータ永続化
// =====================
// ゲーム終了後、盤面の穴の状況に応じて穴ペナルティを更新し、Botがプレイするたびに強化
function updateLearning(socket, botIndex) {
  const stats = socket.gameStats;
  const targetMoves = 300;
  const targetAttack = 3;
  const averageAttack = stats.moves > 0 ? stats.totalAttack / stats.moves : 0;
  const learningRate = 0.01;
  const survivalFactor = (targetMoves - stats.moves) / targetMoves;
  const attackFactor = (targetAttack - averageAttack) / targetAttack;
  
  socket.aiParameters.weightAggregateHeight -= learningRate * survivalFactor;
  socket.aiParameters.weightGarbage += learningRate * attackFactor;
  
  // 追加：盤面の穴数の目標との差分に応じて穴ペナルティを更新（目標：全体3、下部1）
  const currentHoles = computeHoles(socket.currentBoard);
  const currentBottomHoles = computeBottomHoles(socket.currentBoard);
  const targetHoles = 3;
  const targetBottomHoles = 1;
  socket.aiParameters.weightHoles -= learningRate * (currentHoles - targetHoles);
  socket.aiParameters.weightBottomHoles -= learningRate * (currentBottomHoles - targetBottomHoles);
  
  const filename = path.join(dataDir, `bot_${botIndex}.json`);
  fs.writeFileSync(filename, JSON.stringify(socket.aiParameters, null, 2));
}

// =====================
// ■ ゲームループ
// =====================
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function gameLoop(socket, botIndex) {
  async function animateMove(piece, bestMove, board) {
    while (piece.x < bestMove.x) {
      piece.x++;
      socket.emit("BoardStatus", { UserID: socket.id, board: drawBoard(board, piece) });
      await delay(MOVE_ANIMATION_DELAY);
    }
    while (piece.x > bestMove.x) {
      piece.x--;
      socket.emit("BoardStatus", { UserID: socket.id, board: drawBoard(board, piece) });
      await delay(MOVE_ANIMATION_DELAY);
    }
    while (piece.orientation !== bestMove.orientation) {
      piece.orientation = (piece.orientation + 1) % 4;
      socket.emit("BoardStatus", { UserID: socket.id, board: drawBoard(board, piece) });
      await delay(MOVE_ANIMATION_DELAY);
    }
    if (piece.type === "T" && bestMove.isTSpin) await delay(50);
    if (bestMove.y - piece.y >= 5) {
      piece.y = bestMove.y;
      socket.emit("BoardStatus", { UserID: socket.id, board: drawBoard(board, piece) });
    } else {
      await softDropAnimation(piece, board, bestMove.y);
      socket.emit("BoardStatus", { UserID: socket.id, board: drawBoard(board, piece) });
    }
  }
  
  let currentBoard = createEmptyBoard();
  socket.currentBoard = currentBoard;
  socket.gameStats = { totalCleared: 0, moves: 0, totalAttack: 0, renChain: 0 };
  
  let currentPiece = spawnPiece();
  
  while (true) {
    if (!isValidPosition(currentPiece, currentBoard, 0, 0)) break;
    
    const bestMove = findBestMove(currentBoard, currentPiece, socket.aiParameters, socket, socket.botStrength);
    if (bestMove) await animateMove(currentPiece, bestMove, currentBoard);
    else hardDrop(currentPiece, currentBoard);
    
    mergePiece(currentPiece, currentBoard);
    const cleared = clearLines(currentBoard);
    socket.gameStats.totalCleared += cleared;
    socket.gameStats.moves++;
    socket.gameStats.renChain = (cleared > 0) ? socket.gameStats.renChain + 1 : 0;
    const moveGarbage = computeMoveGarbage(currentPiece, cleared, currentBoard, socket.gameStats.renChain, socket.aiParameters);
    socket.gameStats.totalAttack += moveGarbage;
    if (moveGarbage > 0) socket.emit("SendGarbage", { targetId: null, lines: moveGarbage });
    socket.emit("BoardStatus", { UserID: socket.id, board: drawBoard(currentBoard, null) });
    
    let nextPiece = spawnPiece();
    if (!isValidPosition(nextPiece, currentBoard, 0, 0)) break;
    currentPiece = nextPiece;
    socket.currentBoard = currentBoard;
    await delay(BOT_MOVE_DELAY);
  }
  
  socket.emit("PlayerGameStatus", "gameover");
  updateLearning(socket, botIndex);
  socket.emit("BoardStatus", { UserID: socket.id, board: drawBoard(currentBoard, null) });
  await delay(100);
  // 各 Bot ごとにソケットを切断してから再生成する
  socket.disconnect();
  if (AUTO_REMATCH) {
    setTimeout(() => {
      createBot(botIndex, socket.botStrength, socket.aiParameters);
    }, 10000);
  }
}

// =====================
// ■ Multi-Bot サポート
// =====================
function createBot(botIndex, strength, aiParameters) {
  // Bot ごとに独立した Socket を生成
  const socket = io(SERVER_URL, { reconnection: false });
  const botStrength = (typeof strength === "number") ? strength : Math.floor(Math.random() * 101);
  socket.botStrength = botStrength;
  socket.aiParameters = aiParameters ? { ...aiParameters } : { ...BASE_AI_PARAMETERS };
  
  socket.on("connect", () => {
    socket.emit("matching");
  });
  
  socket.on("roomInfo", (data) => {});
  socket.on("CountDown", (data) => {});
  socket.on("ReceiveGarbage", ({ from, lines }) => {
    const numLines = parseInt(lines, 10) || 0;
    if (socket.currentBoard) {
      for (let i = 0; i < numLines; i++) {
        socket.currentBoard.shift();
        let newRow = new Array(10).fill("G");
        const gapIndex = Math.floor(Math.random() * 10);
        newRow[gapIndex] = 0;
        socket.currentBoard.push(newRow);
      }
    }
  });
  socket.on("disconnect", (reason) => {});
  socket.on("error", (err) => {});
  socket.on("StartGame", () => {
    socket.currentBoard = createEmptyBoard();
    socket.gameStats = { totalCleared: 0, moves: 0, totalAttack: 0, renChain: 0 };
    gameLoop(socket, botIndex);
  });
}

for (let i = 0; i < BOT_COUNT; i++) {
  createBot(i + 1);
}
