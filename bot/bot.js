'use strict';
const io = require('socket.io-client');
const { tetrominoes } = require('./core/constants.js');
const {
  isValidPosition, mergePiece, clearLines, hardDrop,
  evaluateBoard, getAllPlacements, moveLeft, moveRight,
  moveDown, moveRotateCW, moveRotateCCW, detectTSpin
} = require('./core/logic.js');
const { BASE_AI_PARAMETERS } = require('./parameters.js');

const AUTO_REMATCH = true;
const BOT_MOVE_DELAY = 400;
const MOVE_ANIMATION_DELAY = 100;
const SERVER_URL = 'http://localhost:6000';

let lastPieceType = null;

function spawnPiece() {
  const types = Object.keys(tetrominoes);
  let t = types[Math.floor(Math.random() * types.length)];
  while (t === lastPieceType) {
    t = types[Math.floor(Math.random() * types.length)];
  }
  lastPieceType = t;
  return { type: t, base: tetrominoes[t].base, ...tetrominoes[t].spawn, orientation: 0, rotated: false };
}

function drawBoard(board, p = null) {
  const d = board.map(r => r.slice());
  if (p) {
    const { getPieceBlocks } = require('./core/logic.js');
    for (const [bx, by] of getPieceBlocks(p)) {
      const x = p.x + bx;
      const y = p.y + by;
      if (y >= 0 && y < 22 && x >= 0 && x < 10) d[y][x] = p.type;
    }
  }
  return d;
}

function computeSendGarbage(piece, linesCleared, renChain, boardAfterClear) {
  let g = 0;
  const perfectClear = boardAfterClear.every(r => r.every(c => c === 0));
  if (perfectClear) return 10;
  if (piece.type === 'T' && piece.isTSpin) {
    if (linesCleared === 1) g += 1;
    else if (linesCleared === 2) g += 4;
    else if (linesCleared === 3) g += 6;
  } else {
    if (linesCleared === 2) g += 1;
    else if (linesCleared === 3) g += 2;
    else if (linesCleared === 4) g += 4;
  }
  if (renChain > 1) {
    const combo = renChain;
    if (combo === 2) g += 1;
    else if (combo === 3) g += 2;
    else if (combo === 4) g += 3;
    else if (combo === 5) g += 4;
    else if (combo === 6) g += 5;
    else if (combo === 7) g += 6;
    else if (combo === 8) g += 7;
    else if (combo >= 9) g += 10;
  }
  return g;
}

const delay = (ms) => new Promise(r => setTimeout(r, ms));

class TetrisBot {
  constructor(index, strength, aiParams, socket) {
    this.index = index;
    this.strength = strength;
    this.aiParams = { ...aiParams };
    this.socket = socket;
    this.isLocal = !!socket;
    this.matched = false;
    this.isGameOver = false;
    this.connect();
  }

  connect() {
    this.matched = false;
    if (!this.isLocal) {
      this.socket = io(SERVER_URL, { reconnection: true });
    }
    this.socket.on('connect', () => {
      if (!this.matched) {
        this.socket.emit('matching');
        this.matched = true;
      }
    });
    this.socket.on('ReceiveGarbage', ({ lines }) => {
      this.pendingGarbage = (this.pendingGarbage || 0) + (parseInt(lines, 10) || 0);
    });
    this.socket.on('StartGame', () => this.startGame());
    this.socket.on('GameOver', () => {
      this.isGameOver = true;
    });
  }

  startGame() {
    this.isGameOver = false;
    this.board = Array.from({ length: 22 }, () => Array(10).fill(0));
    this.currentPiece = spawnPiece();
    this.pendingGarbage = 0;
    this.gameStats = { totalCleared: 0, moves: 0, totalAttack: 0, renChain: 0 };
    this.playLoop();
  }

  async playLoop() {
    while (isValidPosition(this.currentPiece, this.board, 0, 0) && !this.isGameOver) {
      const best = this.findBestMove();
      if (best) await this.animateMove(best);
      else hardDrop(this.currentPiece, this.board);
      mergePiece(this.currentPiece, this.board);
      const cleared = clearLines(this.board);
      this.gameStats.totalCleared += cleared;
      this.gameStats.renChain = cleared ? this.gameStats.renChain + 1 : 0;
      const boardCopy = this.board.map(r => r.slice());
      const sendG = computeSendGarbage(this.currentPiece, cleared, this.gameStats.renChain, boardCopy);
      if (sendG > 0) this.socket.emit('SendGarbage', { targetId: null, lines: sendG });
      this.socket.emit('BoardStatus', { UserID: this.socket.id, board: drawBoard(this.board) });
      if (this.pendingGarbage > 0) this.applyGarbage();
      this.currentPiece = spawnPiece();
      if (!isValidPosition(this.currentPiece, this.board, 0, 0)) break;
      await delay(BOT_MOVE_DELAY);
    }
    this.socket.emit('PlayerGameStatus', 'gameover');
    if (AUTO_REMATCH) {
      setTimeout(() => {
        if (this.isLocal) this.socket.emit('matching');
        else this.connect();
      }, 10000);
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
    this.socket.emit('BoardStatus', { UserID: this.socket.id, board: drawBoard(this.board) });
  }

  async animateMove(best) {
    for (const mv of best.moveSequence) {
      let next;
      if (mv === 'L') next = moveLeft(this.currentPiece, this.board);
      else if (mv === 'R') next = moveRight(this.currentPiece, this.board);
      else if (mv === 'D') next = moveDown(this.currentPiece, this.board);
      else if (mv === 'CW') next = moveRotateCW(this.currentPiece, this.board);
      else if (mv === 'CCW') next = moveRotateCCW(this.currentPiece, this.board);
      if (next) Object.assign(this.currentPiece, next);
      this.socket.emit('BoardStatus', { UserID: this.socket.id, board: drawBoard(this.board, this.currentPiece) });
      await delay(MOVE_ANIMATION_DELAY);
    }
    hardDrop(this.currentPiece, this.board);
  }

  findBestMove() {
    const placements = getAllPlacements(this.board, this.currentPiece);
    if (!placements.length) return null;
    let best = null, bestScore = -Infinity;
    for (const p of placements) {
      const b = this.board.map(r => r.slice());
      mergePiece(p, b);
      p.isTSpin = (p.type === 'T' && detectTSpin(p, b));
      clearLines(b);
      const score = evaluateBoard(b, this.aiParams);
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    return best;
  }
}

module.exports = { TetrisBot, BASE_AI_PARAMETERS };
