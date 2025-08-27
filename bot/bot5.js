// tetris-bot-enhanced.js（超強化 + 最新研究反映版）
'use strict';
const io = require('socket.io-client');
const SERVER_URL = 'http://localhost:6000';

// === 定数 ===
const AUTO_REMATCH = true;
const BOT_COUNT = 98;
const BOT_MOVE_DELAY = 300; // 超高速

// === テトリミノ定義 ===
const tetrominoes = {
  I: { base: [[0,0],[1,0],[2,0],[3,0]], spawn: {x:3,y:0} },
  J: { base: [[0,0],[0,1],[1,1],[2,1]], spawn: {x:3,y:0} },
  L: { base: [[2,0],[0,1],[1,1],[2,1]], spawn: {x:3,y:0} },
  O: { base: [[0,0],[1,0],[0,1],[1,1]], spawn: {x:4,y:0} },
  S: { base: [[1,0],[2,0],[0,1],[1,1]], spawn: {x:3,y:0} },
  T: { base: [[1,0],[0,1],[1,1],[2,1]], spawn: {x:3,y:0} },
  Z: { base: [[0,0],[1,0],[1,1],[2,1]], spawn: {x:3,y:0} }
};

const AI_PARAMS = {
  // 基本評価（生存性最大化）
  weightAggregateHeight: -1.0,  // 総合高さ（さらに緩和）
  weightMaxHeight: -3.5,        // 最大高さ（厳重ペナルティ）
  weightHoles: -5.0,            // 穴（極度のペナルティ）
  weightBumpiness: -3.0,        // 凹凸（極限ペナルティ）
  weightBottomHoles: -8.0,      // 底面近辺の穴（極端に重視）

  // ボード構造最適化
  weightColumnBalance: -1.5,    // 列バランス（強化）
  weightMiddleOpen: 1.5,        // 中央開放（強調）
  weightLowerPlacement: 1.2,    // 下部配置（極力強調）

  // 攻撃性（適度維持）
  weightTSpinBonus: 10.0,       // T-Spin（適度）
  weightPerfectClearBonus: 2.0  // Perfect Clear（最小限）
};

// === ボード関数 ===
function createEmptyBoard() {
  return Array.from({ length: 22 }, () => Array(10).fill(0));
}

function spawnPiece() {
  const types = Object.keys(tetrominoes);
  const t = types[Math.floor(Math.random() * types.length)];
  return { type: t, base: tetrominoes[t].base, ...tetrominoes[t].spawn, orientation: 0 };
}

function getPieceBlocks(p) {
  return p.base.map(([x, y]) => {
    switch(p.orientation) {
      case 1: return [y, -x];
      case 2: return [-x, -y];
      case 3: return [-y, x];
      default: return [x, y];
    }
  });
}

function isValidPosition(p, board, dx, dy, blocks = null) {
  const bl = blocks || getPieceBlocks(p);
  for (const [bx, by] of bl) {
    const x = p.x + dx + bx;
    const y = p.y + dy + by;
    if (x < 0 || x >= 10 || y >= 22 || (y >= 0 && board[y][x] !== 0)) return false;
  }
  return true;
}

function mergePiece(p, board) {
  for (const [bx, by] of getPieceBlocks(p)) {
    const x = p.x + bx;
    const y = p.y + by;
    if (y >= 0 && y < 22 && x >= 0 && x < 10) board[y][x] = p.type;
  }
}

function clearLines(board) {
  const remain = board.filter(r => r.some(c => c === 0));
  const newRows = Array.from({ length: board.length - remain.length }, () => Array(10).fill(0));
  return newRows.concat(remain);
}

function hardDrop(p, board) {
  while (isValidPosition(p, board, 0, 1)) p.y++;
  return p;
}

// === 評価関数 ===
function evaluateBoard(board, p) {
  const h = getColumnHeights(board);
  const holes = countHoles(board);
  const bump = evaluateBumpiness(h);
  const middle = evaluateMiddleOpen(board);
  const balance = evaluateColumnBalance(h);
  let score = (
    AI_PARAMS.weightAggregateHeight * h.reduce((a, v) => a + v, 0) +
    AI_PARAMS.weightBumpiness * bump +
    AI_PARAMS.weightHoles * holes +
    AI_PARAMS.weightMaxHeight * Math.max(...h) +
    AI_PARAMS.weightColumnBalance * balance +
    AI_PARAMS.weightMiddleOpen * middle +
    AI_PARAMS.weightLowerPlacement * (22 - p.y)
  );
  
  // T-Spinボーナス
  if (p.type === 'T' && detectTSpin(p, board)) {
    score += AI_PARAMS.weightTSpinBonus;
  }
  
  // Perfect Clearボーナス
  if (isPerfectClear(board)) {
    score += AI_PARAMS.weightPerfectClearBonus;
  }
  
  return score;
}

function countHoles(board) {
  let holes = 0;
  for (let j = 0; j < 10; j++) {
    let seenBlock = false;
    for (let i = 0; i < 22; i++) {
      if (board[i][j] !== 0) seenBlock = true;
      else if (seenBlock) holes++;
    }
  }
  return holes;
}

function getColumnHeights(board) {
  return board[0].map((_, j) => {
    for (let i = 0; i < 22; i++) {
      if (board[i][j] !== 0) return 22 - i;
    }
    return 0;
  });
}

function evaluateBumpiness(heights) {
  let diff = 0;
  for (let i = 0; i < 9; i++) {
    diff += Math.abs(heights[i] - heights[i + 1]);
  }
  return diff;
}

function evaluateColumnBalance(heights) {
  const avg = heights.reduce((a, b) => a + b, 0) / 10;
  const variance = heights.reduce((sum, h) => sum + (h - avg) ** 2, 0) / 10;
  return Math.sqrt(variance);
}

function evaluateMiddleOpen(board) {
  return board.slice(0, 11).reduce((sum, row) => sum + (row[4] === 0 && row[5] === 0 ? 1 : 0), 0);
}

function detectTSpin(p, board) {
  if (p.type !== 'T') return false;
  const blocks = getPieceBlocks(p);
  const cx = p.x + Math.floor(blocks[1][0]);
  const cy = p.y + Math.floor(blocks[1][1]);
  
  if (cx < 0 || cx >= 10 || cy < 0 || cy >= 22) return false;
  
  let cnt = 0;
  for (const [dx, dy] of [[-1,-1],[1,-1],[-1,1],[1,1]]) {
    const x = cx + dx;
    const y = cy + dy;
    if (x >= 0 && x < 10 && y >= 0 && y < 22 && board[y][x] !== 0) cnt++;
  }
  return cnt >= 3;
}

function isPerfectClear(board) {
  return board.every(row => row.every(cell => cell === 0));
}

// === 移動関数 ===
function moveLeft(p, board) {
  const n = {...p, x: p.x - 1};
  return isValidPosition(n, board, 0, 0) ? n : null;
}

function moveRight(p, board) {
  const n = {...p, x: p.x + 1};
  return isValidPosition(n, board, 0, 0) ? n : null;
}

function moveDown(p, board) {
  const n = {...p, y: p.y + 1};
  return isValidPosition(n, board, 0, 0) ? n : null;
}

function moveRotateCW(p, board) {
  return rotatedPiece(p, 'R', board);
}

function moveRotateCCW(p, board) {
  return rotatedPiece(p, 'L', board);
}

function rotatedPiece(p, dir, board) {
  const table = p.type === 'I' ? srsKick.I : srsKick.normal;
  const key = `${p.orientation}_${dir}`;
  if (!table[key]) return null;
  const { newOrientation, offsets } = table[key];
  const blocks = p.base.map(([x, y]) => {
    switch (newOrientation) {
      case 1: return [y, -x];
      case 2: return [-x, -y];
      case 3: return [-y, x];
      default: return [x, y];
    }
  });
  
  for (const off of offsets) {
    const c = {...p, x: p.x + off.x, y: p.y + off.y, orientation: newOrientation};
    if (isValidPosition(c, board, 0, 0, blocks)) return c;
  }
  return null;
}

// === SRSキック ===
const srsKick = {
  normal: {
    '0_L': { newOrientation: 3, offsets: [{x:1,y:0},{x:1,y:-1},{x:0,y:2},{x:1,y:2}] },
    '0_R': { newOrientation: 1, offsets: [{x:-1,y:0},{x:-1,y:-1},{x:0,y:2},{x:-1,y:2}] },
    '90_L':{ newOrientation:0, offsets: [{x:1,y:0},{x:1,y:1},{x:0,y:-2},{x:1,y:-2}] },
    '90_R':{ newOrientation:2, offsets: [{x:1,y:0},{x:1,y:1},{x:0,y:-2},{x:1,y:-2}] },
    '180_L':{newOrientation:1, offsets:[{x:-1,y:0},{x:-1,y:-1},{x:0,y:2},{x:-1,y:2}]},
    '180_R':{newOrientation:3, offsets:[{x:1,y:0},{x:1,y:-1},{x:0,y:2},{x:1,y:2}]},
    '270_L':{newOrientation:2, offsets:[{x:-1,y:0},{x:-1,y:1},{x:0,y:-2},{x:-1,y:-2}]},
    '270_R':{newOrientation:0, offsets:[{x:-1,y:0},{x:-1,y:1},{x:0,y:-2},{x:-1,y:-2}]}
  },
  I: {
    '0_L': { newOrientation:3, offsets:[{x:-1,y:0},{x:2,y:0},{x:-1,y:-2},{x:2,y:1}] },
    '0_R': { newOrientation:1, offsets:[{x:-2,y:0},{x:1,y:0},{x:-2,y:1},{x:1,y:-2}] },
    '90_L':{ newOrientation:0, offsets:[{x:2,y:0},{x:-1,y:0},{x:2,y:-1},{x:-1,y:2}] },
    '90_R':{ newOrientation:2, offsets:[{x:-1,y:0},{x:2,y:0},{x:-1,y:-2},{x:2,y:1}] },
    '180_L':{newOrientation:1, offsets:[{x:1,y:0},{x:-2,y:0},{x:1,y:2},{x:-2,y:-1}]},
    '180_R':{newOrientation:3, offsets:[{x:2,y:0},{x:-1,y:0},{x:2,y:-1},{x:-1,y:2}]},
    '270_L':{newOrientation:2, offsets:[{x:1,y:0},{x:-2,y:0},{x:-2,y:1},{x:1,y:-2}]},
    '270_R':{newOrientation:0, offsets:[{x:2,y:0},{x:1,y:0},{x:1,y:2},{x:-2,y:-1}]}
  }
};

// === Botクラス ===
class TetrisBot {
  constructor(index) {
    this.index = index;
    this.connect();
  }
  
  connect() {
    this.socket = io(SERVER_URL, { reconnection: true });
    this.socket.on('connect', () => this.socket.emit('matching'));
    this.socket.on('ReceiveGarbage', ({ lines }) => {
      this.pendingGarbage = (this.pendingGarbage || 0) + parseInt(lines, 10);
    });
    this.socket.on('StartGame', () => this.startGame());
  }
  
  startGame() {
    this.board = createEmptyBoard();
    this.currentPiece = spawnPiece();
    this.pendingGarbage = 0;
    this.playLoop();
  }
  
  async playLoop() {
    try {
      while (true) {
        // ボード状態の確認
        if (!isValidPosition(this.currentPiece, this.board, 0, 0)) break;
        
        // 最適な手を探す
        const best = this.findBestMove();
        if (best) {
          // 最適手を適用
          Object.assign(this.currentPiece, best);
        } else {
          // 硬直
          hardDrop(this.currentPiece, this.board);
        }
        
        // ピースを固定
        mergePiece(this.currentPiece, this.board);
        
        // ラインクリア
        const originalBoard = [...this.board];
        const remain = this.board.filter(r => r.some(c => c === 0));
        const clearedLines = this.board.length - remain.length;
        this.board = clearLines(this.board);
        
        // 攻撃計算
        const sendG = computeSendGarbage(this.currentPiece, this.board, clearedLines);
        if (sendG > 0) this.socket.emit('SendGarbage', { targetId: null, lines: sendG });
        
        // ボード更新
        this.socket.emit('BoardStatus', { UserID: this.socket.id, board: this.board });
        
        // ガベージ適用
        if (this.pendingGarbage > 0) this.applyGarbage();
        
        // 新しいピース生成
        this.currentPiece = spawnPiece();
        if (!isValidPosition(this.currentPiece, this.board, 0, 0)) break;
        
        await delay(BOT_MOVE_DELAY);
      }
      
      // ゲームオーバー
      this.socket.emit('PlayerGameStatus', 'gameover');
    } finally {
      this.socket.disconnect();
      if (AUTO_REMATCH) setTimeout(() => this.connect(), 10000);
    }
  }
  
  applyGarbage() {
    for (let i = 0; i < this.pendingGarbage; i++) {
      this.board.shift();
      const row = Array(10).fill('G');
      row[Math.floor(Math.random() * 10)] = 0;
      this.board.push(row);
    }
    this.pendingGarbage = 0;
    this.socket.emit('BoardStatus', { UserID: this.socket.id, board: this.board });
  }
  
  findBestMove() {
    let best = null;
    let bestScore = -Infinity;
    
    // 全回転パターンを探索
    for (let o = 0; o < 4; o++) {
      const p = { ...this.currentPiece, orientation: o };
      const blocks = getPieceBlocks(p);
      
      // X座標の有効範囲を計算
      const minX = Math.max(
        0,
        -Math.min(...blocks.map(([x, y]) => x))
      );
      const maxX = 10 - Math.max(...blocks.map(([x, y]) => x)) - 1;
      
      // X座標の探索
      for (let x = minX; x <= maxX; x++) {
        const c = { ...p, x };
        if (!isValidPosition(c, this.board, 0, 0, blocks)) continue;
        
        // 硬直位置を計算
        const f = hardDrop({ ...c }, this.board);
        
        // ボード状態を複製
        const testBoard = this.board.map(row => [...row]);
        mergePiece(f, testBoard);
        
        // 評価スコア計算
        const score = evaluateBoard(testBoard, f);
        if (score > bestScore) {
          bestScore = score;
          best = f;
        }
      }
    }
    
    return best;
  }
}

// === ヘルパー関数 ===
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function computeSendGarbage(piece, board, linesCleared) {
  let garbage = 0;
  
  // Perfect Clear
  if (isPerfectClear(board)) return 10;
  
  // T-Spin
  if (piece.type === 'T' && detectTSpin(piece, board)) {
    if (linesCleared === 1) garbage = 1;
    else if (linesCleared === 2) garbage = 4;
    else if (linesCleared === 3) garbage = 6;
  } 
  // 通常消し
  else {
    if (linesCleared === 2) garbage = 1;
    else if (linesCleared === 3) garbage = 2;
    else if (linesCleared === 4) garbage = 4;
  }
  
  return garbage;
}

// === 起動 ===
for (let i = 1; i <= BOT_COUNT; i++) new TetrisBot(i);
