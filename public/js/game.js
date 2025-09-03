
import { CONFIG } from './config.js';
import { triggerLineClearEffect, triggerTspinEffect, triggerLockPieceEffect, triggerScoreUpdateEffect } from './effects.js';
import { sendGarbage, socket } from './online.js'; // Import socket
import { attackBarSegments, getAttackBarSum, removeAttackBar, processFlashingGarbage } from './garbage.js';
import { showGameEndScreen } from './ui.js';
import { triggerScreenShake, CELL_SIZE, tetrominoTypeToIndex } from './draw.js';

export const LOCK_DELAY = 500;
export const MAX_FLOOR_KICKS = 15;
export const MAX_LOCK_DELAY_RESETS = 15;

export let gameState = 'LOBBY'; // LOBBY, PLAYING, GAME_OVER
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
export let pieceBag = [];
export let nextPieces = [];

export function setGameState(newState) {
    gameState = newState;
}

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
    y: 0,
    color: t.color,
    isRotation: false,
    lockDelay: 0,
    floorKickCount: 0,
    lastKick: [0, 0],
    lastSRS: 0,
    combo: 0,
    lockDelayResets: 0
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
    for (let i = 0; i < CONFIG.game.nextPiecesCount; i++) {
        nextPieces.push(getNextPieceFromBag());
    }
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
      if (pts > 0) triggerScoreUpdateEffect();
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
        if (!isValidPosition(piece, 0, 1)) { // If piece is on the ground
            if (piece.lockDelayResets < MAX_LOCK_DELAY_RESETS) {
                piece.lockDelay = 0;
                piece.lockDelayResets++;
            }
        }
        return;
    }

    if (piece.type === 'I') {
        if (piece.rotation === 0) offsets = (dir === -1) ? [[-1, 0], [2, 0], [-1, -2], [2, 1]] : [[-2, 0], [1, 0], [-2, 1], [1, -2]];
        else if (piece.rotation === 1) offsets = (dir === -1) ? [[2, 0], [-1, 0], [2, -1], [-1, 2]] : [[-1, 0], [2, 0], [-1, -2], [2, 1]];
        else if (piece.rotation === 2) offsets = (dir === -1) ? [[1, 0], [-2, 0], [1, 2], [-2, -1]] : [[2, 0], [-1, 0], [2, -1], [-1, 2]];
        else if (piece.rotation === 3) offsets = (dir === -1) ? [[1, 0], [-2, 0], [-2, 1], [1, -2]] : [[-2, 0], [1, 0], [1, 2], [-2, -1]];

        for (const [dx, dy] of offsets) {
            if (isValidPosition(piece, dx, dy, newRotation)) {
                if (dx !== 0 || dy !== 0) { // Only count as a kick if there's an actual offset
                    piece.floorKickCount++;
                }
                piece.x += dx;
                piece.y += dy;
                piece.rotation = newRotation;
                piece.isRotation = true;
                if (!isValidPosition(piece, 0, 1)) { // If piece is on the ground
                    if (piece.lockDelayResets < MAX_LOCK_DELAY_RESETS) {
                        piece.lockDelay = 0;
                        piece.lockDelayResets++;
                    }
                }
                return;
            }
        }
        piece.isRotation = false;
        return;
    }

    if (isValidPosition(piece, 0, 0, newRotation)) {
        piece.rotation = newRotation;
        if (!isValidPosition(piece, 0, 1)) { // If piece is on the ground
            if (piece.lockDelayResets < MAX_LOCK_DELAY_RESETS) {
                piece.lockDelay = 0;
                piece.lockDelayResets++;
            }
        }
        piece.isRotation = true;
        return;
    }

    // If we reach here, it means a direct rotation (0,0 offset) was not possible.
    // Now try wall kicks.
    if (piece.floorKickCount >= MAX_FLOOR_KICKS) {
        piece.isRotation = false;
        return; // Prevent further kicks if limit reached
    }

    switch (piece.rotation) {
        case 0: offsets = (dir === -1) ? [[1, 0], [1, -1], [0, 2], [1, 2]] : [[-1, 0], [-1, -1], [0, 2], [-1, 2]]; break;
        case 1: offsets = [[1, 0], [1, 1], [0, -2], [1, -2]]; break;
        case 2: offsets = (dir === 1) ? [[1, 0], [1, -1], [0, 2], [1, 2]] : [[-1, 0], [-1, -1], [0, 2], [-1, 2]]; break;
        case 3: offsets = (dir === -1) ? [[-1, 0], [-1, 1], [0, -2], [-1, -2]] : [[-1, 0], [-1, 1], [0, -2], [-1, -2]]; break;
    }

    for (const [dx, dy] of offsets) {
        if (isValidPosition(piece, dx, dy, newRotation)) {
            if (dx !== 0 || dy !== 0) { // Only count as a kick if there's an actual offset
                piece.floorKickCount++;
            }
            piece.x += dx;
            piece.y += dy;
            piece.rotation = newRotation;
            piece.isRotation = true;
            if (!isValidPosition(piece, 0, 1)) { // If piece is on the ground
                if (piece.lockDelayResets < MAX_LOCK_DELAY_RESETS) {
                    piece.lockDelay = 0;
                    piece.lockDelayResets++;
                }
            }
            return;
        }
    }
    piece.isRotation = false;
}

export function movePiece(offset) {
    if (isValidPosition(currentPiece, offset.x, offset.y)) {
        currentPiece.x += offset.x;
        currentPiece.y += offset.y;
        if (!isValidPosition(currentPiece, 0, 1)) { // If piece is on the ground
            if (currentPiece.lockDelayResets < MAX_LOCK_DELAY_RESETS) {
                currentPiece.lockDelay = 0;
                currentPiece.lockDelayResets++;
            }
        }
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
    if (d > 0) triggerScoreUpdateEffect();
    triggerScreenShake(4, 150);
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
    currentPiece.y = 0;
    currentPiece.lockDelay = 0;
    holdUsed = true;

    // Check for game over after hold
    if (!isValidPosition(currentPiece, 0, 0)) {
        console.log("Game Over condition: Piece blocked immediately after hold.");
        const shape = currentPiece.shape[currentPiece.rotation];
        const isBlockedInSpawn = shape.some(([dx, dy]) => {
            const y = currentPiece.y + dy;
            return y < CONFIG.board.rows - CONFIG.board.visibleRows;
        });

        if (isBlockedInSpawn) {
            console.log("Game Over reason: Piece blocked in spawn area after hold.");
            triggerGameOver();
        }
    }
}

export function triggerGameOver() {
    console.log("triggerGameOver() called.");
    setGameState('GAME_OVER');
    isGameOver = true;
    console.log("Game Over!");
    socket.emit('PlayerGameStatus', 'gameover');
    showGameEndScreen('Game Over');
}

export function resetGame() {
    board = createBoard();
    currentPiece = null;
    holdPiece = null;
    holdUsed = false;
    score = 0;
    level = 1;
    linesCleared = 0;
    isGameOver = false;
    isGameClear = false;
    previousClearWasB2B = false;
    isClearing = false;
    pieceBag = [];
    nextPieces = [];
    attackBarSegments.length = 0; // Clear attack bar
    // Game state is NOT reset here, it's handled by the caller
    initializePieces(); // Re-initialize pieces for a new game
}

export function isBoardEmpty(b) {
    return b.every(r => r.every(c => c === 0));
}

export function lockPiece() {
    if (isClearing) return;

    const lockedPiece = currentPiece;
    mergePiece(lockedPiece);

    const shape = lockedPiece.shape[lockedPiece.rotation];
    const color = CONFIG.colors.tetromino[tetrominoTypeToIndex(lockedPiece.type)];
    shape.forEach(([dx, dy]) => {
        const x = (lockedPiece.x + dx) * CELL_SIZE;
        const y = (lockedPiece.y + dy - (CONFIG.board.rows - CONFIG.board.visibleRows)) * CELL_SIZE;
        triggerLockPieceEffect(x + CELL_SIZE / 2, y + CELL_SIZE / 2, color);
    });

    let tSpin = { detected: false, mini: false };
    if (lockedPiece.type === 'T') {
        tSpin = detectTSpin(lockedPiece);
        if (tSpin.detected) {
            const tSpinScore = tSpin.mini ? CONFIG.scoring.tspinMini : CONFIG.scoring.tspin;
            score += tSpinScore;
            if (tSpinScore > 0) triggerScoreUpdateEffect();
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
      if (pts > 0) triggerScoreUpdateEffect();
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
                console.log("Game Over condition: Piece blocked immediately after spawn (after line clear).");
                const shape = currentPiece.shape[currentPiece.rotation];
                const isBlockedInSpawn = shape.some(([dx, dy]) => {
                    const y = currentPiece.y + dy;
                    return y < CONFIG.board.rows - CONFIG.board.visibleRows;
                });

                if (isBlockedInSpawn) {
                    console.log("Game Over reason: Piece blocked in spawn area after line clear.");
                    triggerGameOver();
                }
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
            console.log("Game Over condition: Piece blocked immediately after spawn (no line clear).");
            const shape = currentPiece.shape[currentPiece.rotation];
            const isBlockedInSpawn = shape.some(([dx, dy]) => {
                const y = currentPiece.y + dy;
                return y < CONFIG.board.rows - CONFIG.board.visibleRows;
            });

            if (isBlockedInSpawn) {
                console.log("Game Over reason: Piece blocked in spawn area (no line clear).");
                triggerGameOver();
            }
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
    console.log(`DEBUG: sendFirepower - clearType: ${clearType}, btb: ${btb}, ren: ${ren}, perfectClear: ${perfectClear}, targetCount: ${targetCount}, total: ${total}`);
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
