import { CONFIG } from './config.js';
import { board, currentPiece, triggerGameOver, isGameClear, initializePieces, setGameClear } from './game.js';
import { update } from './main.js';
import { gameCtx, overlayCtx, gameCanvas, overlayCanvas } from './draw.js';

import { addAttackBar } from './garbage.js';

export const socket = io(CONFIG.serverUrl); // サーバーのポートに合わせる
let isRanking = null;
let currentCountdown = null;
const gameOverStatus = {};
        socket.on("connect", () => {
            console.log("✅ サーバーに接続:", socket.id);
            joinRoom();
        });

        function joinRoom() {
            socket.emit("matching");
        }

        socket.on("roomInfo", (data) => {
            console.log(`ルーム: ${data.roomId}, 参加者: ${data.members.length}`);
        });

        socket.on("CountDown", (count) => {
            drawCount(count);
        });

        socket.on("StartGame", () => {
            currentCountdown = null; // Clear countdown once game starts
            initializePieces(); // Call initializePieces
            update();
        });



        socket.on("ReceiveGarbage", ({ from, lines }) => {
            addAttackBar(lines);
            
        });

// ランキング情報受信時（ゲームオーバー状態の更新）

let RankMap = null;
socket.on("ranking", ({ ranking, yourRankMap }) => {
  console.log("📊 受け取ったランキングデータ:", ranking);
  console.log("📌 プレイヤー別順位:", yourRankMap);

  // 自分の順位処理はそのまま…
  const myRank = yourRankMap[socket.id];
        isRanking = myRank;

  if (myRank !== null) {
    console.log(`🏆 あなたの順位は ${myRank} 位です！`);
    isRanking = myRank;
     RankMap = yourRankMap;
    if (myRank !== 1) {
      triggerGameOver(myRank);
    }
    if (myRank === 1) {
      setGameClear(true);
    }
  } else {
    console.log("⌛ あなたの順位はまだ確定していません...");
  }
  
  // 各ユーザーのゲームオーバー状態を更新
  for (const userId in yourRankMap) {
    gameOverStatus[userId] = yourRankMap[userId] !== null;
  }
});


export function drawGameOver() {
  overlayCtx.fillStyle = "rgba(0,0,0,0.6)";
  overlayCtx.fillRect(0, 0, overlayCanvas.width, overlayCanvas.height);

  overlayCtx.fillStyle = "#FF0000";
  overlayCtx.font = "bold 50px sans-serif";
  overlayCtx.textAlign = "center";
  const rankDisplay = (isRanking !== null) ? isRanking : "ランキング取得中";
  const centerX = overlayCanvas.width / 2;
  const centerY = overlayCanvas.height / 2;
  overlayCtx.fillText("GAME OVER", centerX, centerY - 30);
  overlayCtx.fillText(`Rank: ${rankDisplay}`, centerX, centerY + 30);

  // ゲームオーバー時に状態を送信
  socket.emit("PlayerGameStatus", "gameover");

  // リザルト（ランキング）パネルの描画
  const panelX = overlayCanvas.width * 0.1;
  const panelY = overlayCanvas.height * 0.1;
  const panelWidth = overlayCanvas.width * 0.8;
  const panelHeight = overlayCanvas.height * 0.7;


  // タイトルの描画
  overlayCtx.fillStyle = "#FFFFFF";
  overlayCtx.font = "bold 30px sans-serif";
  overlayCtx.textAlign = "left";
  overlayCtx.fillText("Ranking", panelX + 20, panelY + 40);

  // 取得中かどうか判定して描画
  if (RankMap === null) {
    overlayCtx.font = "20px sans-serif";
    overlayCtx.fillText("ランキング取得中...", panelX + 20, panelY + 80);
  } else {
    // RankMap の各プレイヤーの順位情報を配列にまとめる
    // 例: { "player1": 8, "player2": 9, "player3": 7, "player4": null, ... }
    const rankingEntries = [];
    for (const playerId in RankMap) {
      rankingEntries.push({
        playerId: playerId,
        rank: RankMap[playerId]
      });
    }

    // 自分のプレイヤーID（ここでは socket.id を使用）
    const myPlayerId = socket.id;

    // 数値があるエントリーは昇順（数値が小さいほど上位）に、null のエントリーは後ろに表示
    rankingEntries.sort((a, b) => {
      if (a.rank === null && b.rank === null) return 0;
      if (a.rank === null) return 1;
      if (b.rank === null) return -1;
      return a.rank - b.rank;
    });

    // 各エントリーをリストとして描画
    overlayCtx.font = "20px sans-serif";
    const lineHeight = 30;
    let currentY = panelY + 80;
    rankingEntries.forEach((entry, index) => {
      // まだ値が取得できていなければ「取得中」と表示
      const displayRank = (entry.rank !== null) ? entry.rank : "取得中";
      // 自分のエントリーはハイライト（例：黄色）
      if (entry.playerId === myPlayerId) {
        overlayCtx.fillStyle = "#FFFF00";
      } else {
        overlayCtx.fillStyle = "#FFFFFF";
      }
      overlayCtx.fillText(
        `${index + 1}. Player: ${entry.playerId} - Rank: ${displayRank}`,
        panelX + 20,
        currentY
      );
      currentY += lineHeight;
    });
  }

  // 取得中の状態があれば、1秒後に再描画して最新情報を反映
  let needRefresh = false;
  if (isRanking === null) {
    needRefresh = true;
  }
  if (RankMap === null) {
    needRefresh = true;
  } else {
    for (const playerId in RankMap) {
      if (RankMap[playerId] === null) {
        needRefresh = true;
        break;
      }
    }
  }
  if (needRefresh) {
    setTimeout(drawGameOver, 1000);
  }
}



function drawCount(count) {
    currentCountdown = count;
    console.log("Received countdown: ", count);
    drawCountdown();
}

// This function will be called by the main draw loop in draw.js
export function drawCountdown() {
    if (currentCountdown !== null) {
        console.log("drawCountdown called. currentCountdown:", currentCountdown);
        overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height); // Clear the canvas before drawing
        overlayCtx.fillStyle = "rgba(17, 16, 16, 0.7)"; // Semi-transparent black background
        overlayCtx.fillRect(0, 0, overlayCanvas.width, overlayCanvas.height);

        overlayCtx.fillStyle = "#efececff"; // White text
        overlayCtx.font = "bold 100px sans-serif";
        overlayCtx.textAlign = "center";
        overlayCtx.textBaseline = "middle";
        overlayCtx.fillText(currentCountdown, overlayCanvas.width / 2, overlayCanvas.height / 2);
    }
}




// ライン送信ボタンが押されたときに呼ばれる関数
export function sendGarbage(targetId, lines) {
    // ターゲットIDが指定されていない場合はランダムな相手に送信
    if (!targetId) {
        socket.emit("SendGarbage", { targetId: null, lines });
    } else {
        // ターゲットIDが指定されている場合はその相手に送信
        socket.emit("SendGarbage", { targetId, lines });
    }
}


// グローバル変数
const userMiniBoardMapping = {};
let nextMiniBoardIndex = 0;
const miniBoardsData = [];           // ミニボードのグリッド情報
const lastBoardStates = {};          // ユーザーごとの最新の boardState を保存
const miniCellSize = Math.floor(CONFIG.board.cellSize * 0.15);


// 毎フレーム呼ばれる描画ループ
export function drawminiboardloop() {
  // 既存のメイン描画などはそのまま…

  // miniBoardsData の再生成
  initMiniBoards();

  // 各ユーザーに割り当てられた miniBoard に最新の boardState を描画
  for (const userID in userMiniBoardMapping) {
    const boardID = userMiniBoardMapping[userID];
    const boardState = lastBoardStates[userID] || Array.from({ length: 22 }, () => Array(10).fill(0));
    // userID を渡して描画する
    drawSpecificMiniBoard(userID, boardID, boardState);
  }
}


function initMiniBoards() {
  // miniBoardsData をクリアして再計算
  miniBoardsData.length = 0;
  
  const attackBarWidth = 30, gap = 20;
  const boardWidth = CONFIG.board.cols * CONFIG.board.cellSize;
  const boardHeight = CONFIG.board.visibleRows * CONFIG.board.cellSize;
  const totalWidth = attackBarWidth + gap + boardWidth;
  const startX = (overlayCanvas.width - totalWidth) / 2;
  const attackBarX = startX;
  const boardX = startX + attackBarWidth + gap;
  const boardY = (overlayCanvas.height - boardHeight) / 2;

  // miniボードの設定（縦23×横10 のボード）
  const miniBoardWidth = 10 * miniCellSize;
  const miniBoardHeight = 23 * miniCellSize;
  const miniGap = 10;  // 間隔

  // 左側（Holdの左）のスタート位置
  const miniLeftStartX = attackBarX - 110 - gap - (7 * (miniBoardWidth + miniGap));
  const miniLeftStartY = boardY;
  // 右側（メインボードの右）のスタート位置
  const miniRightStartX = boardX + 110 + boardWidth + gap;
  const miniRightStartY = boardY;

  // 7×7 の mini ボードグリッドを描画（左側＆右側）
  drawMiniBoardGrid(miniLeftStartX, miniLeftStartY, miniBoardWidth, miniBoardHeight, miniGap, "left");
  drawMiniBoardGrid(miniRightStartX, miniRightStartY, miniBoardWidth, miniBoardHeight, miniGap, "right");
}


function drawMiniBoardGrid(startX, startY, boardWidth, boardHeight, gap, position) {
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 7; col++) {
      let x = startX + col * (boardWidth + gap);
      let y = startY + row * (boardHeight + gap);
      const boardID = `${position}_board_${row}_${col}`; // 一意のID
      drawMiniBoard(x, y, boardWidth, boardHeight, boardID);
    }
  }
}

function drawMiniBoard(x, y, boardWidth, boardHeight, boardID) {
  // 枠線を描画
  overlayCtx.strokeStyle = "#FFF";
  overlayCtx.lineWidth = 0.1;
  overlayCtx.strokeRect(x, y, boardWidth, boardHeight);
  
  // miniBoardsData に位置情報を保存
  miniBoardsData.push({ x, y, width: boardWidth, height: boardHeight, id: boardID });
}


function drawSpecificMiniBoard(userID, boardID, boardState) {
  const boardData = miniBoardsData.find(board => board.id === boardID);
  if (!boardData) {
    console.error(`Board with ID ${boardID} not found.`);
    return;
  }
  const { x, y, width, height } = boardData;
  
  // Clear board area and draw the border.
  overlayCtx.clearRect(x, y, width, height);
  overlayCtx.strokeStyle = "#FF0000";
  overlayCtx.lineWidth = 1;
  overlayCtx.strokeRect(x, y, width, height);
  
  // If the user has reached game over, clear the board (skip drawing blocks) and simply display the "KO" overlay.
  if (gameOverStatus[userID]) {
    overlayCtx.fillStyle = "rgba(0, 0, 0, 0.7)";
    overlayCtx.fillRect(x, y, width, height);
    overlayCtx.fillStyle = "#FF0000";
    overlayCtx.font = "bold 20px Arial";
    overlayCtx.textAlign = "center";
    overlayCtx.textBaseline = "middle";
    overlayCtx.fillText("KO", x + width / 2, y + height / 2);
    return;
  }
  
  // Define block colors.
  const blockColors = {
    "I": "#00FFFF",
    "O": "#FFFF00",
    "T": "#800080",
    "J": "#0000FF",
    "L": "#FFA500",
    "Z": "#FF0000",
    "S": "#00FF00"
  };
  
// Draw each non-empty block without the white border.
for (let row = 0; row < boardState.length; row++) {
  for (let col = 0; col < boardState[row].length; col++) {
    const block = boardState[row][col];
    if (block !== 0) {
      const blockX = x + col * miniCellSize;
      const blockY = y + row * miniCellSize;
      // Fallback color is now gray (#808080) instead of black.
      const blockColor = blockColors[block] || "#808080";
      overlayCtx.fillStyle = blockColor;
      overlayCtx.fillRect(blockX, blockY, miniCellSize, miniCellSize);
    }
  }
}

}


// socket.io 側の処理
socket.on("BoardStatus", (data) => {
  // 受信データは { UserID, board } を想定
  const { UserID, board } = data;
  
  // 最新の boardState を保存
  lastBoardStates[UserID] = board;
  
  // 初回の場合は、miniBoard を割り当てる
  if (!userMiniBoardMapping[UserID]) {
    if (nextMiniBoardIndex < miniBoardsData.length) {
      userMiniBoardMapping[UserID] = miniBoardsData[nextMiniBoardIndex].id;
      nextMiniBoardIndex++;
    } else {
      console.warn("利用可能なミニボードが足りません。最初のボードを再利用します。");
      userMiniBoardMapping[UserID] = miniBoardsData[0].id;
    }
  }
  // 次回の描画ループで反映される
});




export let connectionError = false;

// (b) In the window blur event listener, set the new flag and call drawConnectError:
window.addEventListener("blur", () => {
    console.log("ページがフォーカスを失いました");
    if (socket) {
        socket.disconnect(); // ソケット切断
        console.log("Socket.io 接続を切断しました");
        connectionError = true;
        drawConnectError();
    }
});

export function drawConnectError() {
  // Do not call draw() here so that the error message remains visible.
  // Draw an overlay on the existing canvas:
  overlayCtx.fillStyle = "rgba(0, 0, 0, 0.5)"; // 50% transparent black
  overlayCtx.fillRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  
  const attackBarWidth = 30, gap = 20;
  const boardWidth = CONFIG.board.cols * CONFIG.board.cellSize;
  const boardHeight = CONFIG.board.visibleRows * CONFIG.board.cellSize;
  const totalWidth = attackBarWidth + gap + boardWidth;
  const startX = (overlayCanvas.width - totalWidth) / 2;
  const attackBarX = startX;
  const boardY = (overlayCanvas.height - boardHeight) / 2;
  
  overlayCtx.strokeStyle = '#000';
  overlayCtx.strokeRect(attackBarX, boardY, attackBarWidth, boardHeight);
  
  // Draw error message
  overlayCtx.fillStyle = "#FFF"; // White text
  overlayCtx.font = "bold 40px Arial";
  overlayCtx.textAlign = "center";
  overlayCtx.textBaseline = "middle";
  overlayCtx.fillText("通信エラーが発生しました", overlayCanvas.width / 2, overlayCanvas.height / 2);
}

function getBoardWithCurrentPiece() {
  const boardCopy = board.map(row => row.slice());
  const shape = currentPiece.shape[currentPiece.rotation];
  shape.forEach(([dx, dy]) => {
    const x = currentPiece.x + dx;
    const y = currentPiece.y + dy;
    if (y >= 0 && y < boardCopy.length && x >= 0 && x < boardCopy[0].length) {
      boardCopy[y][x] = currentPiece.type;
    }
  });
  return boardCopy;
}

function getGameStateJSON() {
  const state = {
    board: getBoardWithCurrentPiece(),
  };
  return JSON.stringify(state);
}

export function sendBoardStatus() {
  const state = getGameStateJSON();
  const stateWithUserId = {
    UserID: socket.id,
    ...JSON.parse(state)
  };
  socket.emit("BoardStatus", stateWithUserId);
}