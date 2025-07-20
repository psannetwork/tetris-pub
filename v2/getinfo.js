"use strict";

function getBoardWithCurrentPiece() {
  // Create a deep copy of the current board
  const boardCopy = board.map(row => row.slice());

  // Get the current piece's shape for its current rotation
  const shape = currentPiece.shape[currentPiece.rotation];

  // Overlay the current piece onto the copied board
  shape.forEach(([dx, dy]) => {
    const x = currentPiece.x + dx;
    const y = currentPiece.y + dy;
    // Only add the piece if within board bounds
    if (y >= 0 && y < boardCopy.length && x >= 0 && x < boardCopy[0].length) {
      boardCopy[y][x] = currentPiece.type;
    }
  });

  return boardCopy;
}

function getGameStateJSON() {
  const state = {
    board: getBoardWithCurrentPiece(),
   // next: nextPieces.map(piece => ({
    //  type: piece.type,
   //   color: piece.color
  //  })),
   // hold: holdPiece
   //   ? {
   //       type: holdPiece.type,
    //      color: holdPiece.color
    //    }
    //  : null
  };

  return JSON.stringify(state);
}
//getGameStateJSON();
function sendBoardStatus() {
  const state = getGameStateJSON();
  
  // socket.id を UserID として追加
  const stateWithUserId = {
    UserID: socket.id,
    ...JSON.parse(state)  // 既存のゲーム状態をマージ
  };

  socket.emit("BoardStatus", stateWithUserId);
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