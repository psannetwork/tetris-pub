"use strict";
const LOCK_DELAY = 500;
const DAS = 150;
const ARR = 50;
const SD_ARR = 50;
const MAX_FLOOR_KICKS = 15;

let isKeyOperation = false;
let previousClearWasB2B = false;
let isClearing = false;
let isGameOver = false;
let isGameClear = false;
// Garbage bar accumulator (each segment represents 1 line unit)
let attackBarSegments = []; // { value, timestamp }
const MAX_ATTACK = 100;
const PHASE1 = 4000, PHASE2 = 8000, PHASE3 = 12000;

function addGarbagebar(count) {
  let current = getAttackBarSum();
  let addVal = Math.min(count, MAX_ATTACK - current);
  if (addVal <= 0) return;
  attackBarSegments.push({ value: addVal, timestamp: Date.now() });
}

function getAttackBarSum() {
  return attackBarSegments.reduce((sum, seg) => sum + seg.value, 0);
}

function removeAttackBar(amount) {
  let remaining = amount;
  while (remaining > 0 && attackBarSegments.length) {
    let seg = attackBarSegments[0];
    if (seg.value > remaining) {
      seg.value -= remaining;
      remaining = 0;
    } else {
      remaining -= seg.value;
      attackBarSegments.shift();
    }
  }
}

function getFlashingAttackValue() {
  const now = Date.now();
  return attackBarSegments.filter(seg => (now - seg.timestamp) >= PHASE3)
    .reduce((sum, seg) => sum + seg.value, 0);
}

function removeFlashingAttack(amount) {
  let remaining = amount;
  const now = Date.now();
  for (let i = 0; i < attackBarSegments.length && remaining > 0;) {
    let seg = attackBarSegments[i];
    if ((now - seg.timestamp) >= PHASE3) {
      if (seg.value > remaining) { seg.value -= remaining; remaining = 0; i++; }
      else { remaining -= seg.value; attackBarSegments.splice(i, 1); }
    } else {
      i++;
    }
  }
}




function calculateFirepower(clearType, btb, ren, perfectClear, targetCount) {
  if (perfectClear) return 10;
  let base = 0;
  console.log(ren);
  switch (clearType) {
    case "single": base = 0; break;
    case "double": base = 1; break;
    case "triple": base = 2; break;
    case "tetris": base = 4; break;
    case "tsmini": base = 0; break;
    case "tsingle": base = 2; break;
    case "tsdouble": base = 4; break;
    case "tstriple": base = 6; break;
    default: base = 0;
  }
  let btbBonus = btb ? 1 : 0;
  let renBonus = 0;
  if (ren <= 0) {
    renBonus = 0;
  } else if (ren >= 1 && ren <= 2) {
    renBonus = 1;
  } else if (ren >= 3 && ren <= 4) {
    renBonus = 2;
  } else if (ren >= 5 && ren <= 6) {
    renBonus = 3;
  } else if (ren >= 7 && ren <= 9) {
    renBonus = 4;
  } else if (ren >= 10) {
    renBonus = 5;
  }
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

function sendFirepower(clearType, btb, ren, perfectClear, targetCount) {
  let total = calculateFirepower(clearType, btb, ren, perfectClear, targetCount);
  console.log("Calculated firepower: " + total +
    " (Clear: " + clearType +
    ", B2B: " + (btb ? "+1" : "0") +
    ", REN Bonus applied, " +
    "Target Bonus: +" + getTargetBonus(targetCount || 0) + ")");
  return total;
}

function processFlashingGarbage() {
let flashingValue = getFlashingAttackValue();
if (flashingValue > 0) {
  // Instead of just removing the flashing garbage,
  // send it as garbage to the opponent by calling addGarbageLines.
  addGarbageLines(flashingValue);
  removeFlashingAttack(flashingValue);
}
}

// Setup canvas
const canvasElement = document.getElementById("gameCanvas");
const ctx = canvasElement.getContext("2d");
function resizeCanvas() {
  canvasElement.width = window.innerWidth;
  canvasElement.height = window.innerHeight;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// Global board and piece definitions
let board, currentPiece, holdPiece = null, holdUsed = false, score = 0, level = 1, linesCleared = 0;
const boardRows = CONFIG.board.rows, boardCols = CONFIG.board.cols, cellSize = CONFIG.board.cellSize;
function createBoard() {
  let b = [];
  for (let r = 0; r < boardRows; r++) b[r] = new Array(boardCols).fill(0);
  return b;
}
board = createBoard();

function isValidPosition(piece, offsetX, offsetY, newRotation = piece.rotation) {
  const shape = piece.shape[newRotation];
  for (let i = 0; i < shape.length; i++) {
    let x = piece.x + shape[i][0] + offsetX;
    let y = piece.y + shape[i][1] + offsetY;
    if (x < 0 || x >= boardCols || y >= boardRows) return false;
    if (y >= 0 && board[y][x] !== 0) return false;
  }
  return true;
}

function createPiece(type) {
  const t = TETROMINOES[type];
  return {
    type,
    shape: t.shape,
    rotation: 0,
    x: Math.floor(boardCols / 2),
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

function randomPiece() {
  const types = Object.keys(TETROMINOES);
  return createPiece(types[Math.floor(Math.random() * types.length)]);
}

function mergePiece(piece) {
  const shape = piece.shape[piece.rotation];
  for (let i = 0; i < shape.length; i++) {
    let x = piece.x + shape[i][0],
        y = piece.y + shape[i][1];
    if (y >= 0) board[y][x] = piece.type;
  }
}

function clearLines() {
  let lines = [];
  for (let r = 0; r < boardRows; r++) {
    if (board[r].every(cell => cell !== 0)) lines.push(r);
  }
  if (lines.length) {
    triggerLineClearEffect(lines);
    setTimeout(() => {
      for (const row of lines) {
        board.splice(row, 1);
        board.unshift(new Array(boardCols).fill(0));
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

let effects = [];
function triggerLineClearEffect(rows) {
  effects.push({
    type: "lineClear",
    rows,
    startTime: Date.now(),
    duration: CONFIG.effects.lineClearDuration
  });
}
let tspinEffect = null;
function triggerTspinEffect(x, y) {
  tspinEffect = {
    type: "tspin",
    x,
    y,
    startTime: Date.now(),
    duration: CONFIG.effects.tspinEffectDuration
  };
}
function updateEffects() {
  const now = Date.now();
  effects = effects.filter(e => now - e.startTime < e.duration);
  if (tspinEffect && now - tspinEffect.startTime >= tspinEffect.duration)
    tspinEffect = null;
}


function detectTSpin(piece) {
  if (piece.type !== "T" || !piece.isRotation) return { detected: false, mini: false };

  // Define the 4 surrounding offsets (Tミノの周囲4マス)
  const corners = [
    { x: piece.x - 1, y: piece.y - 1 },
    { x: piece.x + 1, y: piece.y - 1 },
    { x: piece.x - 1, y: piece.y + 1 },
    { x: piece.x + 1, y: piece.y + 1 }
  ];
  
  let filled = 0;
  let occupied = [];  // True if the corner is occupied (by wall or block)
  
  for (const c of corners) {
    let occ = false;
    if (c.x < 0 || c.x >= boardCols || c.y >= boardRows) {
      occ = true;
    } else if (c.y >= 0 && board[c.y][c.x] !== 0) {
      occ = true;
    }
    occupied.push(occ);
    if (occ) filled++;
  }
  
  // Require at least 3 of the 4 cells to be occupied.
  if (filled < 3) return { detected: false, mini: false };
  
  let mini = false;
  
  // If exactly 3 cells are occupied and lastSRS is less than 4,
  // further check if the positions match the T-Spin Mini pattern.
  if (filled === 3 && piece.lastSRS < 4) {
    if (piece.rotation === 0) {
      // For upright Tミノ (rotation 0): 
      // The base (下側) cells: occupied[2] and occupied[3] must be filled,
      // and exactly one of the top cells (occupied[0] or occupied[1]) must be filled.
      if (occupied[2] && occupied[3] && ((occupied[0] && !occupied[1]) || (!occupied[0] && occupied[1]))) {
        mini = true;
      }
    } else if (piece.rotation === 1) {
      // For right-facing Tミノ (rotation 1):
      // The base is on the left: occupied[0] and occupied[2] must be filled,
      // and exactly one of the right cells (occupied[1] or occupied[3]) must be filled.
      if (occupied[0] && occupied[2] && ((occupied[1] && !occupied[3]) || (!occupied[1] && occupied[3]))) {
        mini = true;
      }
    } else if (piece.rotation === 3) {
      // For left-facing Tミノ (rotation 3):
      // The base is on the right: occupied[1] and occupied[3] must be filled,
      // and exactly one of the left cells (occupied[0] or occupied[2]) must be filled.
      if (occupied[1] && occupied[3] && ((occupied[0] && !occupied[2]) || (!occupied[0] && occupied[2]))) {
        mini = true;
      }
    }
    // For downward-facing (rotation 2), T-Spin Mini is typically not considered.
  }
  
  return { detected: true, mini: mini };
}

function rotatePiece(piece, dir) {
  const newRotation = (piece.rotation + dir + 4) % 4;
  let offsets = [];
  if (piece.type === "O") { piece.rotation = newRotation; piece.lockDelay = 0; return; }
  if (piece.type === "I") {
    if (piece.rotation === 0)
      offsets = (dir === -1) ? [[-1, 0], [2, 0], [-1, -2], [2, 1]]
        : [[-2, 0], [1, 0], [-2, 1], [1, -2]];
    else if (piece.rotation === 1)
      offsets = (dir === -1) ? [[2, 0], [-1, 0], [2, -1], [-1, 2]]
        : [[-1, 0], [2, 0], [-1, -2], [2, 1]];
    else if (piece.rotation === 2)
      offsets = (dir === -1) ? [[1, 0], [-2, 0], [1, 2], [-2, -1]]
        : [[2, 0], [-1, 0], [2, -1], [-1, 2]];
    else if (piece.rotation === 3)
      offsets = (dir === -1) ? [[1, 0], [-2, 0], [-2, 1], [1, -2]]
        : [[-2, 0], [1, 0], [1, 2], [-2, -1]];
    for (let [dx, dy] of offsets) {
      if (isValidPosition(piece, dx, dy, newRotation)) {
        piece.x += dx; piece.y += dy; piece.rotation = newRotation;
        piece.isRotation = true; piece.lockDelay = 0;
        return;
      }
    }
    piece.isRotation = false; return;
  }
  if (isValidPosition(piece, 0, 0, newRotation)) { piece.rotation = newRotation; piece.lockDelay = 0; piece.isRotation = true; return; }
  switch (piece.rotation) {
    case 0:
      offsets = (dir === -1) ? [[1, 0], [1, -1], [0, 2], [1, 2]]
        : [[-1, 0], [-1, -1], [0, 2], [-1, 2]];
      break;
    case 1:
      offsets = [[1, 0], [1, 1], [0, -2], [1, -2]];
      break;
    case 2:
      offsets = (dir === 1) ? [[1, 0], [1, -1], [0, 2], [1, 2]]
        : [[-1, 0], [-1, -1], [0, 2], [-1, 2]];
      break;
    case 3:
      offsets = (dir === -1) ? [[-1, 0], [-1, 1], [0, -2], [-1, -2]]
        : [[-1, 0], [-1, 1], [0, -2], [-1, -2]];
      break;
  }
  for (let [dx, dy] of offsets) {
    if (isValidPosition(piece, dx, dy, newRotation)) {
      piece.x += dx; piece.y += dy; piece.rotation = newRotation;
      piece.isRotation = true; piece.lockDelay = 0;
      return;
    }
  }
  piece.isRotation = false;
}

function movePiece(offset) {
  if (isValidPosition(currentPiece, offset.x, offset.y)) {
    currentPiece.x += offset.x;
    currentPiece.y += offset.y;
    currentPiece.lockDelay = 0;
    currentPiece.isRotation = false;
  }
}

function hardDrop() {
  let d = 0;
  while (isValidPosition(currentPiece, 0, 1)) { currentPiece.y++; d++; }
  score += d * CONFIG.scoring.drop;
  lockPiece();
}

function isBoardEmpty(b) { return b.every(r => r.every(c => c === 0)); }

function triggerGameOver() {
  isGameOver = true;
  console.log("Game Over!");
}



function drawGameClear() {
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(0, 0, canvasElement.width, canvasElement.height);
  ctx.fillStyle = "#FF0000";
  ctx.font = "bold 50px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("You Win", canvasElement.width / 2, canvasElement.height / 2);
  // ゲームオーバー時に状態を送信
  socket.emit("PlayerGameStatus", "gameover");

}

function lockPiece() {
  if (isClearing) return;
  let lockedPiece = currentPiece;
  mergePiece(lockedPiece);
  let tSpin = { detected: false, mini: false };
  if (lockedPiece.type === "T") {
    tSpin = detectTSpin(lockedPiece);
    if (tSpin.detected) {
      score += tSpin.mini ? CONFIG.scoring.tspinMini : CONFIG.scoring.tspin;
      triggerTspinEffect(lockedPiece.x, lockedPiece.y);
    }
  }
  let lines = [];
  for (let r = 0; r < boardRows; r++) {
    if (board[r].every(c => c !== 0)) lines.push(r);
  }
  
  // Calculate ren (combo). If lines are cleared, increment the previous combo.
  let ren = lockedPiece.combo || 0;
  if (lines.length) {
    ren = (lockedPiece.combo || 0) + 1;
  let btb = (lockedPiece.type === "T" || lines.length === 4) ? previousClearWasB2B : false;
    
    // Line clear effect
    isClearing = true;
    triggerLineClearEffect(lines);
    setTimeout(() => {
      board = board.filter((row, idx) => !lines.includes(idx));
      while (board.length < boardRows) board.unshift(new Array(boardCols).fill(0));
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
      if (lockedPiece.type === "T" && tSpin.detected)
        clearType = tSpin.mini ? "tsmini" : (lines.length === 1 ? "tsingle" : lines.length === 2 ? "tsdouble" : "tstriple");
      else
        clearType = lines.length === 1 ? "single" : lines.length === 2 ? "double" : lines.length === 3 ? "triple" : lines.length === 4 ? "tetris" : "none";
      
      let firepower = sendFirepower(clearType, btb, ren, false, 0);
      processGarbageBar(firepower);
      
      currentPiece = nextPieces.shift();
      currentPiece.lockDelay = 0;
      nextPieces.push(getNextPieceFromBag());
      holdUsed = false;
      previousClearWasB2B = (lockedPiece.type === "T" || lines.length === 4);
      
      // Set the combo for the next piece to the updated ren value.
      currentPiece.combo = ren;
      isClearing = false;
    }, CONFIG.effects.lineClearDuration);
  } else {
    // No lines cleared? Reset the combo.
    currentPiece = nextPieces.shift();
    currentPiece.lockDelay = 0;
    nextPieces.push(getNextPieceFromBag());
    holdUsed = false;
    processFlashingGarbage();
    currentPiece.combo = 0;
    previousClearWasB2B = false;
  }
}


// This function reduces the garbage bar by the firepower amount,
// and if there isn't enough garbage, calls sendGarbage with the remainder.
function processGarbageBar(firepower) {
  let accumulated = getAttackBarSum();
  if (accumulated > 0) {
    let subtract = Math.min(accumulated, firepower);
    removeAttackBar(subtract);
    let remainder = firepower - subtract;
    if (remainder > 0) {
      sendGarbage(null, remainder);
    }
  } else {
    sendGarbage(null, firepower);
  }
}

function addGarbageLines(count) {
  for (let i = 0; i < count; i++) {
    let newRow = new Array(boardCols).fill("G");
    newRow[Math.floor(Math.random() * boardCols)] = 0;
    board.shift();
    board.push(newRow);
  }
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function refillBag() {
  pieceBag = Object.keys(TETROMINOES).slice();
  shuffle(pieceBag);
}

function getNextPieceFromBag() {
  if (!pieceBag.length) refillBag();
  return createPiece(pieceBag.pop());
}

let pieceBag = [];
let nextPieces = [];
currentPiece = getNextPieceFromBag();
for (let i = 0; i < 5; i++) nextPieces.push(getNextPieceFromBag());

function hold() {
  if (holdUsed) return;
  if (holdPiece == null) {
    holdPiece = currentPiece;
    currentPiece = nextPieces.shift();
    currentPiece.lockDelay = 0;
    currentPiece.rotation = 0;
    currentPiece.isRotation = false;
    currentPiece.x = Math.floor(boardCols / 2);
    currentPiece.y = -1;
    nextPieces.push(getNextPieceFromBag());
  } else {
    let temp = currentPiece;
    currentPiece = holdPiece;
    holdPiece = temp;
    currentPiece.rotation = 0;
    currentPiece.isRotation = false;
    currentPiece.x = Math.floor(boardCols / 2);
    currentPiece.y = -1;
    currentPiece.lockDelay = 0;
  }
  holdUsed = true;
}

function drawMiniPiece(piece, posX, posY, cs) {
  const shape = piece.shape[0];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  shape.forEach(([x, y]) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  });
  const offsetX = Math.floor((4 - (maxX - minX + 1)) / 2) - minX;
  const offsetY = Math.floor((4 - (maxY - minY + 1)) / 2) - minY;
  shape.forEach(([x, y]) => {
    let drawX = posX + (x + offsetX) * cs;
    let drawY = posY + (y + offsetY) * cs;
    ctx.fillStyle = piece.color;
    ctx.fillRect(drawX, drawY, cs, cs);
    ctx.strokeStyle = "#000";
    ctx.strokeRect(drawX, drawY, cs, cs);
  });
}

function draw() {
  ctx.fillStyle = CONFIG.colors.background;
  ctx.fillRect(0, 0, canvasElement.width, canvasElement.height);
  
  const attackBarWidth = 30, gap = 20;
  const boardWidth = CONFIG.board.cols * CONFIG.board.cellSize;
  const boardHeight = CONFIG.board.visibleRows * CONFIG.board.cellSize;
  const totalWidth = attackBarWidth + gap + boardWidth;
  const startX = (canvasElement.width - totalWidth) / 2;
  const attackBarX = startX;
  const boardX = startX + attackBarWidth + gap;
  const boardY = (canvasElement.height - boardHeight) / 2;
  
  ctx.strokeStyle = '#000';
  ctx.strokeRect(attackBarX, boardY, attackBarWidth, boardHeight);
  let currentY = boardY + boardHeight;
  for (const seg of attackBarSegments) {
    let segHeight = boardHeight * (seg.value / (MAX_ATTACK * 0.3));
    let elapsed = Date.now() - seg.timestamp;
    let segColor = elapsed < PHASE1 ? 'white' : elapsed < PHASE2 ? 'yellow'
      : elapsed < PHASE3 ? 'red' : (Math.floor(Date.now() / 300) % 2 === 0 ? 'red' : 'white');
    ctx.fillStyle = segColor;
    currentY -= segHeight;
    ctx.fillRect(attackBarX, currentY, attackBarWidth, segHeight);
  }
  
  ctx.fillStyle = CONFIG.colors.boardBackground;
  ctx.fillRect(boardX, boardY, boardWidth, boardHeight);
  for (let r = CONFIG.board.rows - CONFIG.board.visibleRows; r < CONFIG.board.rows; r++) {
    for (let c = 0; c < CONFIG.board.cols; c++) {
      let cell = board[r][c];
      if (cell !== 0) {
        ctx.fillStyle = cell === "G" ? "#555" : CONFIG.colors.tetromino[tetrominoTypeToIndex(cell)];
        ctx.fillRect(boardX + c * CONFIG.board.cellSize,
          boardY + (r - (CONFIG.board.rows - CONFIG.board.visibleRows)) * CONFIG.board.cellSize,
          CONFIG.board.cellSize, CONFIG.board.cellSize);
        ctx.strokeStyle = "#000";
        ctx.strokeRect(boardX + c * CONFIG.board.cellSize,
          boardY + (r - (CONFIG.board.rows - CONFIG.board.visibleRows)) * CONFIG.board.cellSize,
          CONFIG.board.cellSize, CONFIG.board.cellSize);
      }
    }
  }


if (!isValidPosition(currentPiece, 0, 1) && currentPiece.y <= 1) {
  triggerGameOver();
}



drawminiboardloop();    


    
  let ghost = Object.assign({}, currentPiece);
  while (isValidPosition(ghost, 0, 1)) ghost.y++;
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = CONFIG.colors.ghost;
  ghost.shape[ghost.rotation].forEach(([dx, dy]) => {
    let gx = ghost.x + dx, gy = ghost.y + dy;
    if (gy >= 0) {
      ctx.fillRect(boardX + gx * CONFIG.board.cellSize,
        boardY + (gy - (CONFIG.board.rows - CONFIG.board.visibleRows)) * CONFIG.board.cellSize,
        CONFIG.board.cellSize, CONFIG.board.cellSize);
    }
  });
  ctx.globalAlpha = 1.0;
  
  ctx.fillStyle = currentPiece.color;
  currentPiece.shape[currentPiece.rotation].forEach(([dx, dy]) => {
    let x = currentPiece.x + dx, y = currentPiece.y + dy;
    if (y >= 0) {
      ctx.fillRect(boardX + x * CONFIG.board.cellSize,
        boardY + (y - (CONFIG.board.rows - CONFIG.board.visibleRows)) * CONFIG.board.cellSize,
        CONFIG.board.cellSize, CONFIG.board.cellSize);
      ctx.strokeStyle = "#000";
      ctx.strokeRect(boardX + x * CONFIG.board.cellSize,
        boardY + (y - (CONFIG.board.rows - CONFIG.board.visibleRows)) * CONFIG.board.cellSize,
        CONFIG.board.cellSize, CONFIG.board.cellSize);
    }
  });
  
  const now = Date.now();
  effects.forEach(effect => {
    if (effect.type === "lineClear") {
      let alpha = Math.max(0, 1 - (now - effect.startTime) / effect.duration);
      ctx.fillStyle = `rgba(255,255,0,${alpha})`;
      effect.rows.forEach(row => {
        let displayRow = row - (CONFIG.board.rows - CONFIG.board.visibleRows);
        if (displayRow >= 0) {
          ctx.fillRect(boardX, boardY + displayRow * CONFIG.board.cellSize, boardWidth, CONFIG.board.cellSize);
        }
      });
    }
  });
  if (tspinEffect) {
    let alpha = Math.max(0, 1 - (now - tspinEffect.startTime) / tspinEffect.duration);
    ctx.fillStyle = `rgba(255,255,0,${alpha})`;
    ctx.font = "bold 40px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("T-SPIN!", boardX + boardWidth / 2, boardY + boardHeight / 2);
  }
  
  const previewSize = Math.floor(CONFIG.board.cellSize * 0.8);
  const holdBoxX = startX - 20 - previewSize * 4, holdBoxY = boardY;
  ctx.strokeStyle = "#FFF";
  ctx.lineWidth = 2;
  ctx.strokeRect(holdBoxX - 5, holdBoxY - 5, previewSize * 4 + 10, previewSize * 4 + 10);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 18px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("HOLD", holdBoxX, holdBoxY - 10);
  if (holdPiece) drawMiniPiece(holdPiece, holdBoxX, holdBoxY, previewSize);
  
  const nextBoxX = boardX + boardWidth + 20, nextBoxY = boardY;
  ctx.strokeStyle = "#FFF";
  ctx.lineWidth = 2;
  ctx.strokeRect(nextBoxX - 5, nextBoxY - 5, previewSize * 4 + 10, previewSize * 15 + 10);
  ctx.fillText("NEXT", nextBoxX, nextBoxY - 10);
  for (let i = 0; i < Math.min(5, nextPieces.length); i++) {
    drawMiniPiece(nextPieces[i], nextBoxX, nextBoxY + i * previewSize * 3, previewSize);
  }
  
  ctx.fillStyle = "#fff";
  ctx.font = "bold 20px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`Score: ${score}`, boardX, boardY + boardHeight + 30);
  ctx.fillText(`Lines: ${linesCleared}`, boardX, boardY + boardHeight + 60);
  ctx.fillText(`Level: ${level}`, boardX, boardY + boardHeight + 90);
  
  if (isGameOver) drawGameOver();
  if (isGameClear) drawGameClear();

}

function tetrominoTypeToIndex(type) {
  switch (type) {
    case "I": return 1;
    case "J": return 2;
    case "L": return 3;
    case "O": return 4;
    case "S": return 5;
    case "T": return 6;
    case "Z": return 7;
    default: return 0;
  }
}

let lastTime = performance.now(), dropCounter = 0;

function update(time = performance.now()) {
  if (connectionError) {
    drawConnectError();
    requestAnimationFrame(update);
    return;
  }
  if (isGameOver) { draw(); return; }
  if (isGameClear) { draw(); return; }

  isKeyOperation = true;
  let delta = time - lastTime; lastTime = time;
  const now = performance.now();
  if (keys[CONFIG.keyBindings.moveLeft]) {
    let keyObj = keys[CONFIG.keyBindings.moveLeft];
    if (now - keyObj.startTime >= DAS && now - keyObj.lastRepeat >= ARR) {
      movePiece({ x: -1, y: 0 });
      keyObj.lastRepeat = now;
    }
  }
  if (keys[CONFIG.keyBindings.moveRight]) {
    let keyObj = keys[CONFIG.keyBindings.moveRight];
    if (now - keyObj.startTime >= DAS && now - keyObj.lastRepeat >= ARR) {
      movePiece({ x: 1, y: 0 });
      keyObj.lastRepeat = now;
    }
  }
  if (keys[CONFIG.keyBindings.softDrop]) {
    let keyObj = keys[CONFIG.keyBindings.softDrop];
    if (now - keyObj.lastRepeat >= SD_ARR) {
      movePiece({ x: 0, y: 1 });
      keyObj.lastRepeat = now;
    }
  }
  if (effects.length === 0 && tspinEffect === null) {
    dropCounter += delta;
    if (dropCounter > CONFIG.dropInterval / level) {
      movePiece({ x: 0, y: 1 });
      dropCounter = 0;
    }
  } else { dropCounter = 0; }
  if (!isValidPosition(currentPiece, 0, 1)) {
    currentPiece.lockDelay += delta;
    if (currentPiece.lockDelay >= LOCK_DELAY) {
      lockPiece();
      requestAnimationFrame(update);
      return;
    }
  } else { currentPiece.lockDelay = 0; }
  updateEffects();
  draw();
  sendBoardStatus();
  requestAnimationFrame(update);
}

currentPiece = randomPiece();
for (let i = 0; i < 5; i++) nextPieces.push(getNextPieceFromBag());

