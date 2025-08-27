
import { CONFIG } from './config.js';
import { triggerLineClearEffect, triggerTspinEffect } from './effects.js';
import { sendGarbage } from './online.js';
import { attackBarSegments, getAttackBarSum, removeAttackBar, processFlashingGarbage } from './garbage.js';

export const LOCK_DELAY = 500;
export const MAX_FLOOR_KICKS = 15;

export let board;
export let currentPiece;
export let holdPiece = null;
export let holdUsed = false;
export let score = 0;
export let level = 1;
export let linesCleared = 0;
export let isGameOver = false;
export let isGameClear = false;
export let previousClearWasB2B = false;
export let isClearing = false;
export let isGameStarted = false;
export let pieceBag = [];
export let nextPieces = [];

export function createBoard() {
  const b = [];
  for (let r = 0; r < CONFIG.board.rows; r++) {
    b[r] = new Array(CONFIG.board.cols).fill(0);
  }
  return b;
}

board = createBoard();

export function isValidPosition(piece, offsetX, offsetY, newRotation = piece.rotation) {
  const shape = piece.shape[newRotation];
  for (let i = 0; i < shape.length; i++) {
    const x = piece.x + shape[i][0] + offsetX;
    const y = piece.y + shape[i][1] + offsetY;
    if (x < 0 || x >= CONFIG.board.cols || y >= CONFIG.board.rows) return false;
    if (y >= 0 && board[y][x] !== 0) return false;
  }
  return true;
}

export function createPiece(type) {
  const t = CONFIG.TETROMINOES[type];
  return {
    type,
    shape: t.shape,
    rotation: 0,
    x: Math.floor(CONFIG.board.cols / 2),
    y: -1,
    color: t.color,
    isRotation: false,
    lockDelay: 0,
    floorKickCount: 0,
    lastKick: [0, 0],
    lastSRS: 0,
    combo: 0
  };
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function refillBag() {
  pieceBag = Object.keys(CONFIG.TETROMINOES).slice();
  shuffle(pieceBag);
}

export function getNextPieceFromBag() {
  if (!pieceBag.length) refillBag();
  return createPiece(pieceBag.pop());
}

export function initializePieces() {
    refillBag(); // Ensure pieceBag is populated
    currentPiece = getNextPieceFromBag();
    for (let i = 0; i < 5; i++) {
        nextPieces.push(getNextPieceFromBag());
    }
    isGameStarted = true;
}




export function mergePiece(piece) {
  const shape = piece.shape[piece.rotation];
  for (let i = 0; i < shape.length; i++) {
    const x = piece.x + shape[i][0];
    const y = piece.y + shape[i][1];
    if (y >= 0) board[y][x] = piece.type;
  }
}

export function clearLines() {
  let lines = [];
  for (let r = 0; r < CONFIG.board.rows; r++) {
    if (board[r].every(cell => cell !== 0)) lines.push(r);
  }

  if (lines.length) {
    triggerLineClearEffect(lines);
    setTimeout(() => {
      for (const row of lines) {
        board.splice(row, 1);
        board.unshift(new Array(CONFIG.board.cols).fill(0));
      }
      let pts = 0;
      switch (lines.length) {
        case 1: pts = CONFIG.scoring.single; break;
        case 2: pts = CONFIG.scoring.double; break;
        case 3: pts = CONFIG.scoring.triple; break;
        case 4: pts = CONFIG.scoring.tetris; break;
      }
      score += pts;
      linesCleared += lines.length;
      removeAttackBar(lines.length);
    }, CONFIG.effects.lineClearDuration);
  }
}

export function detectTSpin(piece) {
    if (piece.type !== 'T' || !piece.isRotation) return { detected: false, mini: false };

    const corners = [
        { x: piece.x - 1, y: piece.y - 1 },
        { x: piece.x + 1, y: piece.y - 1 },
        { x: piece.x - 1, y: piece.y + 1 },
        { x: piece.x + 1, y: piece.y + 1 },
    ];

    let filled = 0;
    const occupied = [];

    for (const c of corners) {
        let occ = false;
        if (c.x < 0 || c.x >= CONFIG.board.cols || c.y >= CONFIG.board.rows) {
            occ = true;
        } else if (c.y >= 0 && board[c.y][c.x] !== 0) {
            occ = true;
        }
        occupied.push(occ);
        if (occ) filled++;
    }

    if (filled < 3) return { detected: false, mini: false };

    let mini = false;
    if (filled === 3 && piece.lastSRS < 4) {
        if (piece.rotation === 0) {
            if (occupied[2] && occupied[3] && ((occupied[0] && !occupied[1]) || (!occupied[0] && occupied[1]))) {
                mini = true;
            }
        } else if (piece.rotation === 1) {
            if (occupied[0] && occupied[2] && ((occupied[1] && !occupied[3]) || (!occupied[1] && occupied[3]))) {
                mini = true;
            }
        } else if (piece.rotation === 3) {
            if (occupied[1] && occupied[3] && ((occupied[0] && !occupied[2]) || (!occupied[0] && occupied[2]))) {
                mini = true;
            }
        }
    }

    return { detected: true, mini: mini };
}

export function rotatePiece(piece, dir) {
    const newRotation = (piece.rotation + dir + 4) % 4;
    let offsets = [];

    if (piece.type === 'O') {
        piece.rotation = newRotation;
        piece.lockDelay = 0;
        return;
    }

    if (piece.type === 'I') {
        if (piece.rotation === 0) offsets = (dir === -1) ? [[-1, 0], [2, 0], [-1, -2], [2, 1]] : [[-2, 0], [1, 0], [-2, 1], [1, -2]];
        else if (piece.rotation === 1) offsets = (dir === -1) ? [[2, 0], [-1, 0], [2, -1], [-1, 2]] : [[-1, 0], [2, 0], [-1, -2], [2, 1]];
        else if (piece.rotation === 2) offsets = (dir === -1) ? [[1, 0], [-2, 0], [1, 2], [-2, -1]] : [[2, 0], [-1, 0], [2, -1], [-1, 2]];
        else if (piece.rotation === 3) offsets = (dir === -1) ? [[1, 0], [-2, 0], [-2, 1], [1, -2]] : [[-2, 0], [1, 0], [1, 2], [-2, -1]];

        for (const [dx, dy] of offsets) {
            if (isValidPosition(piece, dx, dy, newRotation)) {
                piece.x += dx;
                piece.y += dy;
                piece.rotation = newRotation;
                piece.isRotation = true;
                piece.lockDelay = 0;
                return;
            }
        }
        piece.isRotation = false;
        return;
    }

    if (isValidPosition(piece, 0, 0, newRotation)) {
        piece.rotation = newRotation;
        piece.lockDelay = 0;
        piece.isRotation = true;
        return;
    }

    switch (piece.rotation) {
        case 0: offsets = (dir === -1) ? [[1, 0], [1, -1], [0, 2], [1, 2]] : [[-1, 0], [-1, -1], [0, 2], [-1, 2]]; break;
        case 1: offsets = [[1, 0], [1, 1], [0, -2], [1, -2]]; break;
        case 2: offsets = (dir === 1) ? [[1, 0], [1, -1], [0, 2], [1, 2]] : [[-1, 0], [-1, -1], [0, 2], [-1, 2]]; break;
        case 3: offsets = (dir === -1) ? [[-1, 0], [-1, 1], [0, -2], [-1, -2]] : [[-1, 0], [-1, 1], [0, -2], [-1, -2]]; break;
    }

    for (const [dx, dy] of offsets) {
        if (isValidPosition(piece, dx, dy, newRotation)) {
            piece.x += dx;
            piece.y += dy;
            piece.rotation = newRotation;
            piece.isRotation = true;
            piece.lockDelay = 0;
            return;
        }
    }
    piece.isRotation = false;
}

export function movePiece(offset) {
    if (isValidPosition(currentPiece, offset.x, offset.y)) {
        currentPiece.x += offset.x;
        currentPiece.y += offset.y;
        currentPiece.lockDelay = 0;
        currentPiece.isRotation = false;
    }
}

export function hardDrop() {
    let d = 0;
    while (isValidPosition(currentPiece, 0, 1)) {
        currentPiece.y++;
        d++;
    }
    score += d * CONFIG.scoring.drop;
    lockPiece();
}

export function hold() {
    if (holdUsed) return;
    if (holdPiece == null) {
        holdPiece = currentPiece;
        currentPiece = nextPieces.shift();
        nextPieces.push(getNextPieceFromBag());
    } else {
        const temp = currentPiece;
        currentPiece = holdPiece;
        holdPiece = temp;
    }
    currentPiece.rotation = 0;
    currentPiece.isRotation = false;
    currentPiece.x = Math.floor(CONFIG.board.cols / 2);
    currentPiece.y = -1;
    currentPiece.lockDelay = 0;
    holdUsed = true;
}

export function triggerGameOver() {
    isGameOver = true;
    console.log("Game Over!");
}

export function isBoardEmpty(b) {
    return b.every(r => r.every(c => c === 0));
}

export function lockPiece() {
    if (isClearing) return;

    const lockedPiece = currentPiece;
    mergePiece(lockedPiece);

    let tSpin = { detected: false, mini: false };
    if (lockedPiece.type === 'T') {
        tSpin = detectTSpin(lockedPiece);
        if (tSpin.detected) {
            score += tSpin.mini ? CONFIG.scoring.tspinMini : CONFIG.scoring.tspin;
            triggerTspinEffect(lockedPiece.x, lockedPiece.y);
        }
    }

    let lines = [];
    for (let r = 0; r < CONFIG.board.rows; r++) {
        if (board[r].every(c => c !== 0)) lines.push(r);
    }

    let ren = lockedPiece.combo || 0;
    if (lines.length) {
        ren = (lockedPiece.combo || 0) + 1;
        const btb = (lockedPiece.type === 'T' || lines.length === 4) ? previousClearWasB2B : false;

        isClearing = true;
        triggerLineClearEffect(lines);

        setTimeout(() => {
            board = board.filter((row, idx) => !lines.includes(idx));
            while (board.length < CONFIG.board.rows) {
                board.unshift(new Array(CONFIG.board.cols).fill(0));
            }

            let pts = 0;
            switch (lines.length) {
                case 1: pts = CONFIG.scoring.single; break;
                case 2: pts = CONFIG.scoring.double; break;
                case 3: pts = CONFIG.scoring.triple; break;
                case 4: pts = CONFIG.scoring.tetris; break;
            }
            score += pts;
            linesCleared += lines.length;

            let clearType;
            if (lockedPiece.type === 'T' && tSpin.detected) {
                clearType = tSpin.mini ? 'tsmini' : (lines.length === 1 ? 'tsingle' : lines.length === 2 ? 'tsdouble' : 'tstriple');
            } else {
                clearType = lines.length === 1 ? 'single' : lines.length === 2 ? 'double' : lines.length === 3 ? 'triple' : lines.length === 4 ? 'tetris' : 'none';
            }

            const firepower = sendFirepower(clearType, btb, ren, false, 0);
            processGarbageBar(firepower);

            currentPiece = nextPieces.shift();
            nextPieces.push(getNextPieceFromBag());
            holdUsed = false;
            previousClearWasB2B = (lockedPiece.type === 'T' || lines.length === 4);
            currentPiece.combo = ren;
            isClearing = false;

            // Check for game over after a new piece is spawned
            if (!isValidPosition(currentPiece, 0, 0)) {
                triggerGameOver();
            }
        }, CONFIG.effects.lineClearDuration);
    } else {
        currentPiece = nextPieces.shift();
        nextPieces.push(getNextPieceFromBag());
        holdUsed = false;
        const garbageToAdd = processFlashingGarbage();
        if (garbageToAdd > 0) {
            addGarbageLines(garbageToAdd);
        }
        currentPiece.combo = 0;
        previousClearWasB2B = false;

        // Check for game over after a new piece is spawned
        if (!isValidPosition(currentPiece, 0, 0)) {
            triggerGameOver();
        }
    }
}

export function addGarbageLines(count) {
    for (let i = 0; i < count; i++) {
        const newRow = new Array(CONFIG.board.cols).fill('G');
        newRow[Math.floor(Math.random() * CONFIG.board.cols)] = 0;
        board.shift();
        board.push(newRow);
    }
}

function calculateFirepower(clearType, btb, ren, perfectClear, targetCount) {
    if (perfectClear) return 10;
    let base = 0;
    switch (clearType) {
        case 'single': base = 0; break;
        case 'double': base = 1; break;
        case 'triple': base = 2; break;
        case 'tetris': base = 4; break;
        case 'tsmini': base = 0; break;
        case 'tsingle': base = 2; break;
        case 'tsdouble': base = 4; break;
        case 'tstriple': base = 6; break;
        default: base = 0;
    }
    const btbBonus = btb ? 1 : 0;
    let renBonus = 0;
    if (ren >= 1 && ren <= 2) renBonus = 1;
    else if (ren >= 3 && ren <= 4) renBonus = 2;
    else if (ren >= 5 && ren <= 6) renBonus = 3;
    else if (ren >= 7 && ren <= 9) renBonus = 4;
    else if (ren >= 10) renBonus = 5;
    return base + btbBonus + renBonus;
}

function getTargetBonus(targetCount) {
    if (targetCount <= 1) return 0;
    if (targetCount === 2) return 1;
    if (targetCount === 3) return 3;
    if (targetCount === 4) return 5;
    if (targetCount === 5) return 7;
    return 9;
}

export function sendFirepower(clearType, btb, ren, perfectClear, targetCount) {
    const total = calculateFirepower(clearType, btb, ren, perfectClear, targetCount);
    console.log(`Calculated firepower: ${total} (Clear: ${clearType}, B2B: ${btb ? '+1' : '0'}, REN Bonus applied, Target Bonus: +${getTargetBonus(targetCount || 0)})`);
    return total;
}

export function processGarbageBar(firepower) {
    const accumulated = getAttackBarSum();
    if (accumulated > 0) {
        const subtract = Math.min(accumulated, firepower);
        removeAttackBar(subtract);
        const remainder = firepower - subtract;
        if (remainder > 0) {
            sendGarbage(null, remainder);
        }
    } else {
        sendGarbage(null, firepower);
    }
}

export function setCurrentPiece(piece) {
    currentPiece = piece;
}

export function setHoldPiece(piece) {
    holdPiece = piece;
}

export function setHoldUsed(used) {
    holdUsed = used;
}

export function setScore(newScore) {
    score = newScore;
}

export function setLevel(newLevel) {
    level = newLevel;
}

export function setLinesCleared(cleared) {
    linesCleared = cleared;
}

export function setGameOver(over) {
    isGameOver = over;
}

export function setGameClear(clear) {
    isGameClear = clear;
}

export function setPreviousClearWasB2B(btb) {
    previousClearWasB2B = btb;
}

export function setClearing(clearing) {
    isClearing = clearing;
}
