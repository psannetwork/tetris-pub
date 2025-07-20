"use strict";

const io = require("socket.io-client");
const fs = require("fs");
const path = require("path");

const AUTO_REMATCH = true;
const BOT_COUNT = 99;
const BOT_MOVE_DELAY = 400;
const MOVE_ANIMATION_DELAY = 100;
const SOFT_DROP_DELAY = 100;
const SERVER_URL = "https://tetris.psannetwork.net/";
const dataDir = "./data";
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

// Adjusted evaluation parameters: holes are penalized more.
const BASE_AI_PARAMETERS = {
  weightLineClear: 1.0,
  weightTetris: 12.0,         // Increased bonus for Tetris clear (4 lines)
  weightTSpin: 2.0,
  weightCombo: 3.5,
  weightAggregateHeight: -0.8,
  weightBumpiness: -0.2,
  weightHoles: -3.0,          // Increase hole penalty
  weightBottomHoles: -3.5,
  weightUpperRisk: -1.0,
  weightMiddleOpen: 1.9,
  weightHoldFlexibility: 1.0,
  weightNextPiece: 1.5,
  weightLowerPlacement: 0.7,
  weightUpperPlacement: -0.5,
  weightEdgePenalty: -0.2,
  lineClearBonus: 1.0,
  weightGarbage: 10,
  // Additional hybrid evaluation parameters:
  holeDepthFactor: 0.3,       // penalty per depth level for each hole
  lowerHoleFactor: 0.5,       // extra penalty for holes in lower rows (row >=16)
  contiguousHoleFactor: 0.5,  // extra penalty per adjacent hole
  maxHeightPenaltyFactor: 0.1,// penalty factor for maximum column height (exponential)
  bumpinessFactor: 1.0,
  wellFactor: -0.7            // negative bonus for wells (wells are risky)
};

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

// ── Board & Piece Operations ──
function createEmptyBoard() {
  return Array.from({ length: 22 }, () => Array(10).fill(0));
}
function getPieceBlocks(piece) {
  return piece.base.map(([x, y]) => {
    switch(piece.orientation) {
      case 1: return [y, -x];
      case 2: return [-x, -y];
      case 3: return [-y, x];
      default: return [x, y];
    }
  });
}
function isValidPosition(piece, board, dx, dy, candidateBlocks = null) {
  const blocks = candidateBlocks || getPieceBlocks(piece);
  for (let [bx, by] of blocks) {
    const nx = piece.x + dx + bx, ny = piece.y + dy + by;
    if (nx < 0 || nx >= 10 || ny >= 22 || (ny >= 0 && board[ny][nx] !== 0))
      return false;
  }
  return true;
}
function mergePiece(piece, board) {
  for (let [bx, by] of getPieceBlocks(piece)) {
    const x = piece.x + bx, y = piece.y + by;
    if (y >= 0 && y < 22 && x >= 0 && x < 10)
      board[y][x] = piece.type;
  }
}
// Clear complete rows in one pass. If multiple rows are complete, remove all of them simultaneously.
function clearLines(board) {
  // 完全な行を取り除く
  const remainingRows = board.filter(row => row.some(cell => cell === 0));
  // 消去された行数を計算
  const numCleared = board.length - remainingRows.length;
  // 新たに空行を先頭に追加
  const newRows = Array.from({ length: numCleared }, () => Array(10).fill(0));
  // board を一度に更新
  const newBoard = newRows.concat(remainingRows);
  // board 配列の内容を更新（参照を維持するために in-place で代入）
  for (let i = 0; i < board.length; i++) {
    board[i] = newBoard[i];
  }
  return numCleared;
}
function attemptRotation(piece, direction, board) {
  if (piece.type === "O") return true;
  const table = (piece.type === "I") ? srsKick.I : srsKick.normal;
  const key = `${piece.orientation}_${direction}`;
  if (!table[key]) return false;
  const { newOrientation, offsets } = table[key];
  const candidateBlocks = piece.base.map(([x, y]) => {
    switch(newOrientation) {
      case 1: return [y, -x];
      case 2: return [-x, -y];
      case 3: return [-y, x];
      default: return [x, y];
    }
  });
  for (let off of offsets) {
    const nx = piece.x + off.x, ny = piece.y + off.y;
    if (isValidPosition({ ...piece, x: nx, y: ny, orientation: newOrientation },
                         board, 0, 0, candidateBlocks)) {
      Object.assign(piece, { x: nx, y: ny, orientation: newOrientation });
      if (piece.type === "T") piece.rotated = true;
      return true;
    }
  }
  return false;
}
function hardDrop(piece, board) {
  while(isValidPosition(piece, board, 0, 1)) piece.y++;
  return piece;
}
async function softDropAnimation(piece, board, targetY) {
  while(piece.y < targetY && isValidPosition(piece, board, 0, 1)){
    piece.y++;
    await delay(SOFT_DROP_DELAY);
  }
}
function spawnPiece() {
  const types = Object.keys(tetrominoes);
  const type = types[Math.floor(Math.random() * types.length)];
  return { type, base: tetrominoes[type].base, ...tetrominoes[type].spawn, 
           orientation: 0, isTSpin: false, rotated: false };
}
function drawBoard(board, piece) {
  const display = board.map(row => row.slice());
  if(piece) {
    for (let [bx, by] of getPieceBlocks(piece)) {
      const x = piece.x + bx, y = piece.y + by;
      if (y >= 0 && y < 22 && x >= 0 && x < 10)
        display[y][x] = piece.type;
    }
  }
  return display;
}

// ── Evaluation Functions ──
// Evaluate holes with depth, lower-row emphasis, and contiguous hole penalty.
function evaluateHoles(board, params) {
  let penalty = 0;
  const rows = board.length, cols = board[0].length;
  for(let j = 0; j < cols; j++){
    let contiguous = 0, seenBlock = false;
    for(let i = 0; i < rows; i++){
      if(board[i][j] !== 0){
        seenBlock = true;
        contiguous = 0;
      } else if(seenBlock){
        penalty += params.holeDepthFactor * i;
        if(i >= 16) penalty += params.lowerHoleFactor * (i - 15);
        contiguous++;
        if(contiguous > 1) penalty += params.contiguousHoleFactor * (contiguous - 1);
      }
    }
  }
  return penalty;
}
// Evaluate maximum column height with an exponential penalty.
function evaluateHeight(heights, params) {
  const avg = heights.reduce((a,b)=> a+b, 0) / heights.length;
  const maxH = Math.max(...heights);
  return avg + Math.exp(maxH * params.maxHeightPenaltyFactor);
}
// Evaluate bumpiness.
function evaluateBumpiness(heights, params) {
  return heights.slice(0, heights.length-1)
         .reduce((sum, h, i) => sum + Math.abs(h - heights[i+1]), 0) * params.bumpinessFactor;
}
// Evaluate wells: detect vertical wells and add a penalty.
function evaluateWells(board, params) {
  const rows = board.length, cols = board[0].length;
  let total = 0;
  for(let j = 0; j < cols; j++){
    for(let i = 0; i < rows; i++){
      if(board[i][j] !== 0) continue;
      const leftBlocked = (j === 0) || (board[i][j-1] !== 0);
      const rightBlocked = (j === cols-1) || (board[i][j+1] !== 0);
      if(leftBlocked && rightBlocked) {
        let depth = 1;
        for(let k = i+1; k < rows && board[k][j] === 0; k++){
          depth++;
        }
        total += params.wellFactor * depth;
      }
    }
  }
  return total;
}
function getColumnHeights(board) {
  const cols = board[0].length;
  return Array.from({length: cols}, (_, j) => {
    for(let i = 0; i < board.length; i++){
      if(board[i][j] !== 0) return board.length - i;
    }
    return 0;
  });
}
function evaluateLineClear(cleared, board) {
  let bonus = cleared * 2;
  for(let i = board.length - cleared; i < board.length; i++){
    bonus += 0.5;
  }
  return bonus;
}
function computeUpperRisk(board) {
  let risk = 0;
  for(let i = 0; i < 4; i++){
    for(let j = 0; j < board[0].length; j++){
      if(board[i][j] !== 0) risk += (4 - i);
    }
  }
  return risk;
}
function evaluateBoard(board, params) {
  const heights = getColumnHeights(board);
  const aggregateHeight = heights.reduce((sum, h) => sum + h, 0);
  const bumpiness = evaluateBumpiness(heights, params);
  const holePenalty = evaluateHoles(board, params);
  const heightScore = evaluateHeight(heights, params);
  const wellScore = evaluateWells(board, params);
  const middleOpen = board.slice(0, Math.floor(board.length/2))
                        .reduce((sum, row) => sum + ((row[4]===0 && row[5]===0) ? 1 : 0), 0)
                        * params.weightMiddleOpen;
  let score = params.weightAggregateHeight * aggregateHeight +
              params.weightBumpiness * bumpiness +
              params.weightHoles * holePenalty +
              params.weightUpperRisk * computeUpperRisk(board) +
              middleOpen + wellScore + heightScore;
  score += computeHoleAccessibilityPenalty(board);
  return score;
}
// Accessibility penalty for holes.
function computeHoleAccessibilityPenalty(board) {
  let penalty = 0;
  const rows = board.length, cols = board[0].length;
  for (let j = 0; j < cols; j++) {
    let blockFound = false;
    for (let i = 0; i < rows; i++) {
      if (board[i][j] !== 0) blockFound = true;
      else if (blockFound) {
        const accessible = (j > 0 && board[i][j-1] === 0) || (j < cols - 1 && board[i][j+1] === 0);
        penalty += accessible ? -0.5 : 1;
      }
    }
  }
  return penalty;
}
function computePlacementBonus(placement, params) {
  const blocks = getPieceBlocks(placement);
  const avgRow = blocks.reduce((sum, [,dy]) => sum + (placement.y + dy), 0) / blocks.length;
  let bonus = 0;
  for(let [dx, dy] of blocks){
    if(placement.y + dy < 4) bonus += params.weightUpperPlacement;
    if([0,9].includes(placement.x + dx)) bonus += params.weightEdgePenalty;
  }
  bonus += params.weightLowerPlacement * avgRow;
  return bonus;
}
function detectTSpin(piece, board) {
  if(piece.type !== "T" || !piece.rotated) return false;
  const cx = piece.x + 1, cy = piece.y + 1;
  let count = 0;
  for(let [dx, dy] of [[-1,-1],[1,-1],[-1,1],[1,1]]){
    if(cx + dx < 0 || cx + dx >= 10 || cy + dy < 0 || cy + dy >= 22 || board[cy+dy][cx+dx] !== 0)
      count++;
  }
  return count >= 3;
}
function computeMoveGarbage(piece, linesCleared, board, renChain, params) {
  let bonus = 0;
  const dangerous = board.slice(0,5).some(row => row.some(cell => cell !== 0));
  if(piece.type === "T" && detectTSpin(piece, board))
    bonus += params.weightTSpin * (dangerous ? 0.5 : 1);
  if(linesCleared > 0){
    bonus += params.weightLineClear * linesCleared + evaluateLineClear(linesCleared, board);
    if(linesCleared === 4)
      bonus += dangerous ? params.weightTetris * 0.5 : params.weightTetris;
  }
  if(renChain > 1)
    bonus += params.weightCombo * (renChain - 1) * (dangerous ? 0.5 : 1);
  if(board.every(row => row.every(cell => cell === 0)))
    bonus += 10;
  return bonus;
}
function countTSpinOpportunities(board) {
  let count = 0;
  const Tpiece = { type: "T", base: tetrominoes.T.base, ...tetrominoes.T.spawn, orientation: 0, rotated: false };
  for(let o = 0; o < 4; o++){
    const testPiece = { ...Tpiece, orientation: o };
    for(let x = -3; x < 10; x++){
      let candidate = { ...testPiece, x, y: testPiece.y };
      if(!isValidPosition(candidate, board, 0, 0)) continue;
      let dropped = hardDrop({ ...candidate }, board);
      if(detectTSpin(dropped, board)) count++;
    }
  }
  return count;
}

// ── Movement and BFS Search ──
function clonePiece(piece) {
  return { type: piece.type, base: piece.base, x: piece.x, y: piece.y, orientation: piece.orientation, rotated: piece.rotated || false };
}
function rotatedPiece(piece, direction, board) {
  if(piece.type === "O") return clonePiece(piece);
  const table = piece.type === "I" ? srsKick.I : srsKick.normal;
  const key = `${piece.orientation}_${direction}`;
  if(!table[key]) return null;
  const { newOrientation, offsets } = table[key];
  const candidateBlocks = piece.base.map(([x, y]) => {
    switch(newOrientation) {
      case 1: return [y, -x];
      case 2: return [-x, -y];
      case 3: return [-y, x];
      default: return [x, y];
    }
  });
  for(let off of offsets){
    let candidate = { ...piece, x: piece.x + off.x, y: piece.y + off.y, orientation: newOrientation };
    if(isValidPosition(candidate, board, 0, 0, candidateBlocks))
      return candidate;
  }
  return null;
}
function moveLeft(piece, board) {
  const next = clonePiece(piece); next.x--;
  return isValidPosition(next, board, 0, 0) ? next : null;
}
function moveRight(piece, board) {
  const next = clonePiece(piece); next.x++;
  return isValidPosition(next, board, 0, 0) ? next : null;
}
function moveDown(piece, board) {
  const next = clonePiece(piece); next.y++;
  return isValidPosition(next, board, 0, 0) ? next : null;
}
function moveRotateCW(piece, board) { return rotatedPiece(piece, "R", board); }
function moveRotateCCW(piece, board) { return rotatedPiece(piece, "L", board); }
function simulateHardDrop(piece, board) {
  let test = clonePiece(piece);
  while(isValidPosition(test, board, 0, 1)) test.y++;
  return test;
}
function findMoveSequence(initial, target, board) {
  const queue = [{ piece: clonePiece(initial), path: [] }];
  const visited = new Set([`${initial.x},${initial.y},${initial.orientation}`]);
  const moves = [
    { move: "L", fn: moveLeft },
    { move: "R", fn: moveRight },
    { move: "D", fn: moveDown },
    { move: "CW", fn: moveRotateCW },
    { move: "CCW", fn: moveRotateCCW }
  ];
  while(queue.length){
    const { piece, path } = queue.shift();
    const dropped = simulateHardDrop(piece, board);
    if(dropped.x === target.x && dropped.y === target.y && dropped.orientation === target.orientation)
      return path;
    for(let m of moves){
      const next = m.fn(piece, board);
      if(!next) continue;
      const key = `${next.x},${next.y},${next.orientation}`;
      if(visited.has(key)) continue;
      visited.add(key);
      queue.push({ piece: next, path: [...path, m.move] });
    }
  }
  return null;
}
function getAllPlacements(board, piece) {
  const placements = [];
  for(let o = 0; o < 4; o++){
    const testPiece = { ...piece, orientation: o, rotated: o !== piece.orientation };
    for(let x = -3; x < 10; x++){
      let candidate = { ...testPiece, x, y: testPiece.y };
      if(!isValidPosition(candidate, board, 0, 0)) continue;
      let finalCandidate = hardDrop({ ...candidate }, board);
      const moveSeq = findMoveSequence(piece, finalCandidate, board);
      if(!moveSeq) continue;
      finalCandidate.moveSequence = moveSeq;
      finalCandidate.tspinBonus = (finalCandidate.type === "T" && detectTSpin(finalCandidate, board)) ? 2 : 0;
      placements.push(finalCandidate);
    }
  }
  return placements;
}
function findBestMove(board, currentPiece, params, socket, botStrength) {
  const placements = getAllPlacements(board, currentPiece);
  if(placements.length === 0) return null;
  let bestScore = -Infinity, bestMove = null;
  const FIREPOWER_THRESHOLD = 20;
  const currentAttack = socket.gameStats.totalAttack;
  for(let placement of placements){
    const simulatedBoard = board.map(row => row.slice());
    mergePiece(placement, simulatedBoard);
    const cleared = clearLines(simulatedBoard);
    placement.isTSpin = (placement.type === "T" && detectTSpin(placement, simulatedBoard));
    const garbagePotential = computeMoveGarbage(placement, cleared, simulatedBoard, socket.gameStats.renChain, params);
    let dynamicGarbageWeight = params.weightGarbage * (currentAttack > FIREPOWER_THRESHOLD ? 2 : 0.5);
    let score = evaluateBoard(simulatedBoard, params) + (garbagePotential * dynamicGarbageWeight);
    score += computePlacementBonus(placement, params);
    if(placement.type === "T" && placement.isTSpin) score += placement.tspinBonus;
    if(socket.lastMove && placement.x === socket.lastMove.x && placement.orientation === socket.lastMove.orientation)
      score -= params.weightCombo;
    if(score > bestScore) { bestScore = score; bestMove = placement; }
  }
  socket.lastMove = bestMove ? { x: bestMove.x, orientation: bestMove.orientation } : socket.lastMove;
  if(Math.random() < (100 - botStrength) / 400)
    bestMove = placements[Math.floor(Math.random() * placements.length)];
  return bestMove;
}

// ── Learning & Persistence ──
function updateLearning(socket, botIndex) {
  const stats = socket.gameStats;
  const targetMoves = 300, targetAttack = 3;
  const averageAttack = stats.moves > 0 ? stats.totalAttack / stats.moves : 0;
  const learningRate = 0.01;
  const survivalFactor = (targetMoves - stats.moves) / targetMoves;
  const attackFactor = (targetAttack - averageAttack) / targetAttack;
  socket.aiParameters.weightAggregateHeight -= learningRate * survivalFactor;
  socket.aiParameters.weightGarbage += learningRate * attackFactor;
  const currentHoles = evaluateHoles(socket.currentBoard, socket.aiParameters);
  const currentBottomHoles = computeBottomHoles(socket.currentBoard);
  socket.aiParameters.weightHoles -= learningRate * (currentHoles - 3);
  socket.aiParameters.weightBottomHoles -= learningRate * (currentBottomHoles - 1);
  const filename = path.join(dataDir, `bot_${botIndex}.json`);
  fs.writeFileSync(filename, JSON.stringify(socket.aiParameters, null, 2));
}
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
function computeBottomHoles(board) {
  let bottomHoles = 0;
  for(let i = board.length - 5; i < board.length; i++){
    for(let j = 0; j < board[0].length; j++){
      if(board[i][j] === 0 && board.slice(0,i).some(row => row[j] !== 0))
        bottomHoles++;
    }
  }
  return bottomHoles;
}

// ── Game Loop & Animation ──
async function gameLoop(socket, botIndex) {
  async function animateMove(piece, bestMove, board) {
    if(!bestMove.moveSequence) {
      hardDrop(piece, board);
      socket.emit("BoardStatus", { UserID: socket.id, board: drawBoard(board, piece) });
      return;
    }
    for(let move of bestMove.moveSequence) {
      let next = move === "L" ? moveLeft(piece, board)
              : move === "R" ? moveRight(piece, board)
              : move === "D" ? moveDown(piece, board)
              : move === "CW" ? moveRotateCW(piece, board)
              : move === "CCW" ? moveRotateCCW(piece, board)
              : null;
      if(next) Object.assign(piece, next);
      socket.emit("BoardStatus", { UserID: socket.id, board: drawBoard(board, piece) });
      await delay(MOVE_ANIMATION_DELAY);
    }
    hardDrop(piece, board);
    socket.emit("BoardStatus", { UserID: socket.id, board: drawBoard(board, piece) });
  }
  let currentBoard = createEmptyBoard();
  socket.currentBoard = currentBoard;
  socket.gameStats = { totalCleared: 0, moves: 0, totalAttack: 0, renChain: 0 };
  socket.pendingGarbage = 0;
  let currentPiece = spawnPiece();

  while(isValidPosition(currentPiece, currentBoard, 0, 0)) {
    const bestMove = findBestMove(currentBoard, currentPiece, socket.aiParameters, socket, socket.botStrength);
    if(bestMove) await animateMove(currentPiece, bestMove, currentBoard);
    else hardDrop(currentPiece, currentBoard);
    mergePiece(currentPiece, currentBoard);
    const cleared = clearLines(currentBoard);
    socket.gameStats.totalCleared += cleared;
    socket.gameStats.moves++;
    socket.gameStats.renChain = (cleared > 0) ? socket.gameStats.renChain + 1 : 0;
    const moveGarbage = computeMoveGarbage(currentPiece, cleared, currentBoard, socket.gameStats.renChain, socket.aiParameters);
    socket.gameStats.totalAttack += moveGarbage;
    if(moveGarbage > 0)
      socket.emit("SendGarbage", { targetId: null, lines: moveGarbage });
    socket.emit("BoardStatus", { UserID: socket.id, board: drawBoard(currentBoard, null) });
    if(socket.pendingGarbage > 0){
      for(let i = 0; i < socket.pendingGarbage; i++){
        currentBoard.shift();
        let newRow = Array(10).fill("G");
        newRow[Math.floor(Math.random()*10)] = 0;
        currentBoard.push(newRow);
      }
      socket.pendingGarbage = 0;
      socket.emit("BoardStatus", { UserID: socket.id, board: drawBoard(currentBoard, null) });
    }
    let nextPiece = spawnPiece();
    if(!isValidPosition(nextPiece, currentBoard, 0, 0)) break;
    currentPiece = nextPiece;
    socket.currentBoard = currentBoard;
    await delay(BOT_MOVE_DELAY);
  }
  socket.emit("PlayerGameStatus", "gameover");
  updateLearning(socket, botIndex);
  socket.emit("BoardStatus", { UserID: socket.id, board: drawBoard(currentBoard, null) });
  await delay(100);
  socket.disconnect();
  if(AUTO_REMATCH)
    setTimeout(() => createBot(botIndex, socket.botStrength, socket.aiParameters), 10000);
}

// ── Multi-Bot Support & Error Handling ──
function createBot(botIndex, strength, aiParameters) {
  const socket = io(SERVER_URL, { reconnection: true });
  socket.botStrength = (typeof strength === "number") ? strength : Math.floor(Math.random()*101);
  socket.aiParameters = aiParameters ? { ...aiParameters } : { ...BASE_AI_PARAMETERS };

  socket.on("connect", () => {
    console.log(`Bot ${botIndex} connected as ${socket.id}`);
    socket.emit("matching");
  });
  socket.on("disconnect", reason => {
    console.warn(`Bot ${botIndex} disconnected: ${reason}`);
  });
  socket.on("error", err => {
    console.error(`Bot ${botIndex} encountered error:`, err);
  });
  socket.on("roomInfo", data => {});
  socket.on("CountDown", data => {});
  socket.on("ReceiveGarbage", ({ lines }) => {
    socket.pendingGarbage = (socket.pendingGarbage || 0) + (parseInt(lines,10) || 0);
  });
  socket.on("StartGame", () => {
    socket.currentBoard = createEmptyBoard();
    socket.gameStats = { totalCleared: 0, moves: 0, totalAttack: 0, renChain: 0 };
    gameLoop(socket, botIndex);
  });
}

for(let i = 0; i < BOT_COUNT; i++){
  createBot(i + 1);
}
