"use strict";
const io = require("socket.io-client");
const fs = require("fs");
const path = require("path");

// =====================
// ■ Bot/AI 設定
// =====================
const BOT_COUNT = 30;
const BOT_MOVE_DELAY = 400;
const MOVE_ANIMATION_DELAY = 100;
const SOFT_DROP_DELAY = 100;

const BASE_AI_PARAMETERS = {
  weightAggregateHeight: -0.510066,
  weightCompleteLines: 0.760666,
  weightHoles: -0.35663,
  weightBumpiness: -0.184483,
  lineClearBonus: 1.0,
  weightGarbage: 10,            // 火力（Garbage）評価の基本重み
  weightWells: -0.5,            // ウェル評価
  weightRowTransitions: -0.5,   // 行遷移のペナルティ
  weightColumnTransitions: -0.5,// 列遷移のペナルティ
  weightHoleDepth: -0.3         // 穴の深さのペナルティ
};

const SERVER_URL = "https://tetris.psannetwork.net/";
const dataDir = "./data";
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}

// =====================
// ■ テトリミノ定義＆ SRS キックテーブル
// =====================
const tetrominoes = {
  I: { base: [[0,0],[1,0],[2,0],[3,0]], spawn: { x: 3, y: 0 } },
  J: { base: [[0,0],[0,1],[1,1],[2,1]], spawn: { x: 3, y: 0 } },
  L: { base: [[2,0],[0,1],[1,1],[2,1]], spawn: { x: 3, y: 0 } },
  O: { base: [[0,0],[1,0],[0,1],[1,1]], spawn: { x: 4, y: 0 } },
  S: { base: [[1,0],[2,0],[0,1],[1,1]], spawn: { x: 3, y: 0 } },
  T: { base: [[1,0],[0,1],[1,1],[2,1]], spawn: { x: 3, y: 0 } },
  Z: { base: [[0,0],[1,0],[1,1],[2,1]], spawn: { x: 3, y: 0 } }
};

const srsKick = {
  normal: {
    "0_L": { newOrientation: 3, offsets: [ { x: 1, y: 0 }, { x: 1, y: -1 }, { x: 0, y: 2 }, { x: 1, y: 2 } ] },
    "0_R": { newOrientation: 1, offsets: [ { x: -1, y: 0 }, { x: -1, y: -1 }, { x: 0, y: 2 }, { x: -1, y: 2 } ] },
    "90_L": { newOrientation: 0, offsets: [ { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: -2 }, { x: 1, y: -2 } ] },
    "90_R": { newOrientation: 2, offsets: [ { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: -2 }, { x: 1, y: -2 } ] },
    "180_L": { newOrientation: 1, offsets: [ { x: -1, y: 0 }, { x: -1, y: -1 }, { x: 0, y: 2 }, { x: -1, y: 2 } ] },
    "180_R": { newOrientation: 3, offsets: [ { x: 1, y: 0 }, { x: 1, y: -1 }, { x: 0, y: 2 }, { x: 1, y: 2 } ] },
    "270_L": { newOrientation: 2, offsets: [ { x: -1, y: 0 }, { x: -1, y: 1 }, { x: 0, y: -2 }, { x: -1, y: -2 } ] },
    "270_R": { newOrientation: 0, offsets: [ { x: -1, y: 0 }, { x: -1, y: 1 }, { x: 0, y: -2 }, { x: -1, y: -2 } ] }
  },
  I: {
    "0_L": { newOrientation: 3, offsets: [ { x: -1, y: 0 }, { x: 2, y: 0 }, { x: -1, y: -2 }, { x: 2, y: 1 } ] },
    "0_R": { newOrientation: 1, offsets: [ { x: -2, y: 0 }, { x: 1, y: 0 }, { x: -2, y: 1 }, { x: 1, y: -2 } ] },
    "90_L": { newOrientation: 0, offsets: [ { x: 2, y: 0 }, { x: -1, y: 0 }, { x: 2, y: -1 }, { x: -1, y: 2 } ] },
    "90_R": { newOrientation: 2, offsets: [ { x: -1, y: 0 }, { x: 2, y: 0 }, { x: -1, y: -2 }, { x: 2, y: 1 } ] },
    "180_L": { newOrientation: 1, offsets: [ { x: 1, y: 0 }, { x: -2, y: 0 }, { x: 1, y: 2 }, { x: -2, y: -1 } ] },
    "180_R": { newOrientation: 3, offsets: [ { x: 2, y: 0 }, { x: -1, y: 0 }, { x: 2, y: -1 }, { x: -1, y: 2 } ] },
    "270_L": { newOrientation: 2, offsets: [ { x: 1, y: 0 }, { x: -2, y: 0 }, { x: -2, y: 1 }, { x: 1, y: -2 } ] },
    "270_R": { newOrientation: 0, offsets: [ { x: 2, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 2 }, { x: -2, y: -1 } ] }
  }
};

// =====================
// ■ 盤面・ミノ操作の基本関数群
// =====================
function createEmptyBoard() {
  const rows = 22, cols = 10;
  const board = [];
  for (let r = 0; r < rows; r++) {
    board.push(new Array(cols).fill(0));
  }
  return board;
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
// ■ Tスピン判定＆ Garbage 送信量計算
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

// 火力（攻撃力）を重視するため、各消去の火力ボーナスをより大きく設定
function computeMoveGarbage(piece, linesCleared, board, renChain) {
  let bonus = 0;
  if (piece.type === "T" && detectTSpin(piece, board)) {
    if (linesCleared === 1) bonus = 4;
    else if (linesCleared === 2) bonus = 8;
    else if (linesCleared === 3) bonus = 12;
  } else {
    if (linesCleared === 1) bonus = 0;
    else if (linesCleared === 2) bonus = 2;
    else if (linesCleared === 3) bonus = 4;
    else if (linesCleared === 4) bonus = 8;
  }
  if (renChain >= 2 && renChain <= 3) bonus += 1;
  else if (renChain >= 4 && renChain <= 5) bonus += 2;
  else if (renChain >= 6 && renChain <= 7) bonus += 3;
  else if (renChain >= 8 && renChain <= 10) bonus += 4;
  else if (renChain >= 11) bonus += 5;

  const isAllClear = board.every(row => row.every(cell => cell !== 0));
  if (isAllClear) bonus += 10;
  return bonus;
}

// =====================
// ■ 新たな評価項目
// =====================

// ウェル：左右が埋まっている空セルの連続数
function computeWells(board) {
  let wells = 0;
  const rows = board.length;
  const cols = board[0].length;
  for (let j = 0; j < cols; j++) {
    for (let i = 0; i < rows; i++) {
      if (board[i][j] === 0) {
        const leftFilled = (j === 0) || (board[i][j - 1] !== 0);
        const rightFilled = (j === cols - 1) || (board[i][j + 1] !== 0);
        if (leftFilled && rightFilled) {
          let depth = 0;
          let k = i;
          while (k < rows && board[k][j] === 0) {
            depth++;
            k++;
          }
          wells += depth;
          i = k - 1;
        }
      }
    }
  }
  return wells;
}

// 行遷移：各行で「空セル⇔ブロック」の切り替わり数
function computeRowTransitions(board) {
  let transitions = 0;
  const width = board[0].length;
  for (let i = 0; i < board.length; i++) {
    let row = board[i];
    let prev = 1; // 左側の壁は埋まっていると仮定
    for (let j = 0; j < width; j++) {
      if (row[j] === 0 && prev !== 0) transitions++;
      else if (row[j] !== 0 && prev === 0) transitions++;
      prev = row[j];
    }
    if (prev === 0) transitions++; // 右側の壁も考慮
  }
  return transitions;
}

// 列遷移：各列で「空セル⇔ブロック」の切り替わり数
function computeColumnTransitions(board) {
  let transitions = 0;
  const height = board.length;
  const width = board[0].length;
  for (let j = 0; j < width; j++) {
    let prev = 1; // 上側の壁は埋まっていると仮定
    for (let i = 0; i < height; i++) {
      if (board[i][j] === 0 && prev !== 0) transitions++;
      else if (board[i][j] !== 0 && prev === 0) transitions++;
      prev = board[i][j];
    }
    if (prev === 0) transitions++; // 下側の壁も考慮
  }
  return transitions;
}

// 穴の深さ：各穴について、列内で最初のブロックからの距離を合計
function computeHoleDepth(board) {
  let depth = 0;
  const height = board.length;
  const width = board[0].length;
  for (let j = 0; j < width; j++) {
    let top = -1;
    for (let i = 0; i < height; i++) {
      if (board[i][j] !== 0) {
        top = i;
        break;
      }
    }
    if (top !== -1) {
      for (let i = top + 1; i < height; i++) {
        if (board[i][j] === 0) depth += (i - top);
      }
    }
  }
  return depth;
}

// =====================
// ■ ヒューリスティック評価と候補手探索
// =====================
function evaluateBoard(board, parameters) {
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
  const aggregateHeight = heights.reduce((sum, h) => sum + h, 0);
  let bumpiness = 0;
  for (let j = 0; j < cols - 1; j++) {
    bumpiness += Math.abs(heights[j] - heights[j + 1]);
  }
  let holes = 0;
  for (let j = 0; j < cols; j++) {
    let blockFound = false;
    for (let i = 0; i < board.length; i++) {
      if (board[i][j] !== 0) blockFound = true;
      else if (blockFound && board[i][j] === 0) holes++;
    }
  }
  let completeLines = 0;
  for (let i = 0; i < board.length; i++) {
    if (board[i].every(cell => cell !== 0)) completeLines++;
  }
  const wells = computeWells(board);
  const rowTransitions = computeRowTransitions(board);
  const columnTransitions = computeColumnTransitions(board);
  const holeDepth = computeHoleDepth(board);

  return parameters.weightAggregateHeight * aggregateHeight +
         parameters.weightCompleteLines * completeLines +
         parameters.weightHoles * holes +
         parameters.weightBumpiness * bumpiness +
         parameters.weightWells * wells +
         parameters.weightRowTransitions * rowTransitions +
         parameters.weightColumnTransitions * columnTransitions +
         parameters.weightHoleDepth * holeDepth +
         (completeLines * parameters.lineClearBonus);
}

function getAllPlacements(board, piece) {
  const placements = [];
  for (let orientation = 0; orientation < 4; orientation++) {
    const testPiece = { ...piece, orientation, rotated: (orientation !== piece.orientation) };
    for (let x = -3; x < 10; x++) {
      let candidate = { ...testPiece, x: x, y: testPiece.y };
      if (!isValidPosition(candidate, board, 0, 0)) continue;
      let finalCandidate = hardDrop({ ...candidate }, board);
      if (finalCandidate.type === "T" && detectTSpin(finalCandidate, board)) {
        finalCandidate.tspinBonus = 2;
      } else {
        finalCandidate.tspinBonus = 0;
      }
      placements.push(finalCandidate);
    }
  }
  return placements;
}

// Bot の現在の累積火力に応じて、同じ火力ボーナスに重みを動的に付与する。
// 例えば、累積火力が高いと（例: 20以上）、より火力を送る手を優先する。
function findBestMove(board, currentPiece, aiParameters, socket, botStrength) {
  const placements = getAllPlacements(board, currentPiece);
  if (placements.length === 0) return null;
  let bestScore = -Infinity, bestMove = null;
  // 火力の閾値（任意の値。状況に合わせて調整可能）
  const FIREPOWER_THRESHOLD = 20;
  const currentAttack = socket.gameStats.totalAttack;
  for (let placement of placements) {
    const simulatedBoard = board.map(row => row.slice());
    mergePiece(placement, simulatedBoard);
    const linesCleared = clearLines(simulatedBoard);
    placement.isTSpin = (placement.type === "T" && detectTSpin(placement, simulatedBoard));
    const garbagePotential = computeMoveGarbage(placement, linesCleared, simulatedBoard, simulatedBoard.renChain || 0);
    // 動的火力重み：累積火力が高ければ火力送信を優先（重みを2倍）、低ければ蓄積重視（半分の重み）
    let dynamicGarbageWeight = aiParameters.weightGarbage;
    if (currentAttack > FIREPOWER_THRESHOLD) {
      dynamicGarbageWeight *= 2;
    } else {
      dynamicGarbageWeight *= 0.5;
    }
    let score = evaluateBoard(simulatedBoard, aiParameters) + (garbagePotential * dynamicGarbageWeight);
    if (placement.type === "T" && placement.isTSpin) score += placement.tspinBonus;
    if (score > bestScore) {
      bestScore = score;
      bestMove = placement;
    }
  }
  let errorChance = (100 - botStrength) / 400;
  if (Math.random() < errorChance) {
    bestMove = placements[Math.floor(Math.random() * placements.length)];
  }
  return bestMove;
}

// =====================
// ■ 学習処理＆永続化
// =====================
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
    if (piece.type === "T" && bestMove.isTSpin) {
      await delay(50);
    }
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
    if (!isValidPosition(currentPiece, currentBoard, 0, 0)) {
      break;
    }
    const bestMove = findBestMove(currentBoard, currentPiece, socket.aiParameters, socket, socket.botStrength);
    if (bestMove) {
      await animateMove(currentPiece, bestMove, currentBoard);
    } else {
      hardDrop(currentPiece, currentBoard);
    }
    mergePiece(currentPiece, currentBoard);
    const cleared = clearLines(currentBoard);
    socket.gameStats.totalCleared += cleared;
    socket.gameStats.moves++;
    if (cleared > 0) {
      socket.gameStats.renChain++;
    } else {
      socket.gameStats.renChain = 0;
    }
    const moveGarbage = computeMoveGarbage(currentPiece, cleared, currentBoard, socket.gameStats.renChain);
    socket.gameStats.totalAttack += moveGarbage;
    if (moveGarbage > 0) {
      socket.emit("SendGarbage", { targetId: null, lines: moveGarbage });
    }
    socket.emit("BoardStatus", { UserID: socket.id, board: drawBoard(currentBoard, null) });
    currentPiece = spawnPiece();
    socket.currentBoard = currentBoard;
    if (currentBoard[0].some(cell => cell !== 0)) {
      break;
    }
    await delay(BOT_MOVE_DELAY);
  }

  socket.emit("PlayerGameStatus", "gameover");
  updateLearning(socket, botIndex);
  socket.emit("BoardStatus", { UserID: socket.id, board: drawBoard(currentBoard, null) });
  await delay(100);
  socket.disconnect();
  setTimeout(() => {
    createBot(botIndex, socket.botStrength, socket.aiParameters);
  }, 10000);
}

// =====================
// ■ Multi-Bot サポート
// =====================
function createBot(botIndex, strength, aiParameters) {
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
