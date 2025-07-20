// 事前に穴の位置を決める
let garbageHoleColumn = Math.floor(Math.random() * CONFIG.board.cols);

function addGarbageLine() {
  const newRow = new Array(CONFIG.board.cols).fill("G");
  newRow[garbageHoleColumn] = 0; // 事前に決めた穴の位置を適用
  board.shift();
  board.push(newRow);
}

function addGarbageLines(count) {
  for (let i = 0; i < count; i++) {
    addGarbageLine();
  }
    resetGarbageHole();
}

// 穴の位置をリセットしたい場合
function resetGarbageHole() {
  garbageHoleColumn = Math.floor(Math.random() * CONFIG.board.cols);
}

