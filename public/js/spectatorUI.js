
import { CONFIG } from './config.js';

export const canvas = document.getElementById("gameCanvas");
export const ctx = canvas.getContext("2d");

export function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// Socket.IO Connection
import { CONFIG } from './config.js';

export const canvas = document.getElementById("gameCanvas");
export const ctx = canvas.getContext("2d");

export function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// Socket.IO Connection
export const socket = io(CONFIG.serverUrl);

// Global state variables for spectator UI
export let currentRoomId = null;
export let boards = {}; // { userId: { board, username, isKO } }
export let rankingData = null;
export let overlayMessage = null;
export let gameStarted = false;
export let showRankingOverlay = false;
export let roomList = []; // To store fetched room data for drawing
export let showControlPanel = true; // To control visibility of room list panel
export let showSpectateBar = false; // To control visibility of spectate info bar
export let showHamburger = false; // To control visibility of hamburger icon

// Function to reset spectator state
export function resetSpectate() {
  boards = {};
  rankingData = null;
  overlayMessage = null;
  gameStarted = false;
  showRankingOverlay = false;
  // No need to hide div, as we will draw on canvas
}

// Room List Fetch
export function fetchRooms() {
  fetch(CONFIG.serverUrl + "/rooms")
    .then((res) => res.json())
    .then((data) => {
      roomList = data.rooms.filter(room => room.playersCount > 0); // Filter out empty rooms
      if (roomList.length === 0) {
        console.log("現在、ルームはありません。");
      }
    })
    .catch((err) => {
      console.error("ルーム情報の取得エラー", err);
      roomList = []; // Clear room list on error
    });
}

// Function to draw the control panel (room list)
export function drawControlPanel() {
  if (!showControlPanel) return;

  const panelWidth = 320;
  const panelPadding = 20;
  const panelX = (canvas.width - panelWidth) / 2;
  const panelY = (canvas.height - (roomList.length * 40 + 100)) / 2; // Approximate height

  ctx.fillStyle = "rgba(255, 255, 255, 0.97)";
  ctx.fillRect(panelX, panelY, panelWidth, roomList.length * 40 + 100); // Adjust height dynamically
  ctx.strokeStyle = "#ccc";
  ctx.strokeRect(panelX, panelY, panelWidth, roomList.length * 40 + 100);

  ctx.fillStyle = "#333";
  ctx.font = "24px Arial";
  ctx.textAlign = "center";
  ctx.fillText("ルーム一覧", canvas.width / 2, panelY + 30);

  let currentY = panelY + 60;
  if (roomList.length === 0) {
    ctx.font = "16px Arial";
    ctx.fillText("現在、ルームはありません。", canvas.width / 2, currentY);
  } else {
    roomList.forEach((room, index) => {
      const buttonText = `ルームID: ${room.roomId} | プレイヤー: ${room.playersCount} | ゲーム開始: ${room.isGameStarted}`;
      const buttonX = panelX + panelPadding;
      const buttonY = currentY;
      const buttonWidth = panelWidth - 2 * panelPadding;
      const buttonHeight = 30;

      // Store button bounds for click detection
      room.buttonBounds = { x: buttonX, y: buttonY, width: buttonWidth, height: buttonHeight };

      ctx.fillStyle = "#007acc";
      ctx.fillRect(buttonX, buttonY, buttonWidth, buttonHeight);
      ctx.fillStyle = "#fff";
      ctx.font = "16px Arial";
      ctx.textAlign = "center";
      ctx.fillText(buttonText, buttonX + buttonWidth / 2, buttonY + buttonHeight / 2 + 5);
      currentY += buttonHeight + 10;
    });
  }

  // Refresh button
  const refreshButtonX = panelX + panelPadding;
  const refreshButtonY = currentY + 10;
  const refreshButtonWidth = panelWidth - 2 * panelPadding;
  const refreshButtonHeight = 30;
  ctx.fillStyle = "#007acc";
  ctx.fillRect(refreshButtonX, refreshButtonY, refreshButtonWidth, refreshButtonHeight);
  ctx.fillStyle = "#fff";
  ctx.font = "16px Arial";
  ctx.textAlign = "center";
  ctx.fillText("更新", refreshButtonX + refreshButtonWidth / 2, refreshButtonY + refreshButtonHeight / 2 + 5);
  // Store refresh button bounds
  exports.refreshButtonBounds = { x: refreshButtonX, y: refreshButtonY, width: refreshButtonWidth, height: refreshButtonHeight };
}

// Function to draw spectate bar
export function drawSpectateBar() {
  if (!showSpectateBar) return;

  const barWidth = 200;
  const barHeight = 40;
  const barX = canvas.width - barWidth - 15;
  const barY = 15;

  ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
  ctx.fillRect(barX, barY, barWidth, barHeight);
  ctx.strokeStyle = "#ccc";
  ctx.strokeRect(barX, barY, barWidth, barHeight);

  ctx.fillStyle = "#333";
  ctx.font = "16px Arial";
  ctx.textAlign = "right";
  ctx.fillText("観戦中...", barX + barWidth - 10, barY + barHeight / 2 + 5);
}

// Function to draw hamburger icon
export function drawHamburger() {
  if (!showHamburger) return;

  const hamX = 15;
  const hamY = 15;
  const hamSize = 30;

  ctx.fillStyle = "#fff";
  ctx.fillRect(hamX, hamY + 4, hamSize, 4);
  ctx.fillRect(hamX, hamY + 13, hamSize, 4);
  ctx.fillRect(hamX, hamY + 22, hamSize, 4);
  // Store hamburger bounds
  exports.hamburgerBounds = { x: hamX, y: hamY, width: hamSize, height: hamSize };
}

// Function to draw ranking overlay
export function drawRankingOverlay() {
  if (!showRankingOverlay) return;

  const panelWidth = 300;
  const panelPadding = 20;
  const panelX = (canvas.width - panelWidth) / 2;
  const panelY = (canvas.height - 400) / 2; // Approximate height

  ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
  ctx.fillRect(panelX, panelY, panelWidth, 400); // Adjust height dynamically
  ctx.strokeStyle = "#fff";
  ctx.strokeRect(panelX, panelY, panelWidth, 400);

  ctx.fillStyle = "#fff";
  ctx.font = "24px Arial";
  ctx.textAlign = "center";
  ctx.fillText("ランキング", canvas.width / 2, panelY + 30);

  let currentY = panelY + 60;
  ctx.font = "16px Arial";
  ctx.fillText(`総人数: ${Object.keys(boards).length}`, canvas.width / 2, currentY);
  currentY += 30;

  if (rankingData && rankingData.yourRankMap) {
    let rankArr = [];
    for (const id in rankingData.yourRankMap) {
      const rank = rankingData.yourRankMap[id];
      if (rank !== null) {
        rankArr.push({ id, rank });
      }
    }
    rankArr.sort((a, b) => a.rank - b.rank);

    rankArr.forEach((item, idx) => {
      ctx.textAlign = "left";
      ctx.fillText(`${idx + 1}. ${item.id} (ランク: ${item.rank})`, panelX + panelPadding, currentY);
      currentY += 25;
    });
  } else {
    ctx.textAlign = "center";
    ctx.fillText("ランキング情報がありません", canvas.width / 2, currentY);
  }
}

// Function to draw overlay messages (countdown, game start/end)
export function drawOverlayMessage() {
  if (overlayMessage) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#fff";
    ctx.font = "50px Arial";
    ctx.textAlign = "center";
    ctx.fillText(overlayMessage, canvas.width / 2, canvas.height / 2);
  }
}

// Click detection for canvas elements
export function handleCanvasClick(event) {
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  // Check for refresh button click
  if (showControlPanel && exports.refreshButtonBounds &&
      x >= exports.refreshButtonBounds.x && x <= exports.refreshButtonBounds.x + exports.refreshButtonBounds.width &&
      y >= exports.refreshButtonBounds.y && y <= exports.refreshButtonBounds.y + exports.refreshButtonBounds.height) {
    console.log("Refresh button clicked!");
    return "refreshRooms";
  }

  // Check for room button clicks
  if (showControlPanel && roomList.length > 0) {
    for (const room of roomList) {
      if (room.buttonBounds &&
          x >= room.buttonBounds.x && x <= room.buttonBounds.x + room.buttonBounds.width &&
          y >= room.buttonBounds.y && y <= room.buttonBounds.y + room.buttonBounds.height) {
        console.log("Room button clicked:", room.roomId);
        return { type: "spectateRoom", roomId: room.roomId };
      }
    }
  }

  // Check for hamburger icon click
  if (showHamburger && exports.hamburgerBounds &&
      x >= exports.hamburgerBounds.x && x <= exports.hamburgerBounds.x + exports.hamburgerBounds.width &&
      y >= exports.hamburgerBounds.y && y <= exports.hamburgerBounds.y + exports.hamburgerBounds.height) {
    console.log("Hamburger icon clicked!");
    return "hamburgerClick";
  }

  return null; // No interactive element clicked
}

// Main drawing loop
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw game boards (if spectating a game)
  let playerIds = Object.keys(boards);
  if (playerIds.length > 100) {
    playerIds = playerIds.slice(0, 100);
  }
  const n = playerIds.length;
  if (n > 0) {
    const marginX = 10, marginY = 10;
    let bestCellSize = 0, bestColumns = 1;
    for (let cols = 1; cols <= n; cols++) {
      const rows = Math.ceil(n / cols);
      const cellSizeCandidate = Math.min(
        (canvas.width - (cols + 1) * marginX) / (cols * 10),
        (canvas.height - (rows + 1) * marginY) / (rows * 22)
      );
      if (cellSizeCandidate > bestCellSize) {
        bestCellSize = cellSizeCandidate;
        bestColumns = cols;
      }
    }
    const cellSize = bestCellSize;
    const boardW = cellSize * 10;
    const boardH = cellSize * 22;
    playerIds.forEach((userId, index) => {
      const col = index % bestColumns;
      const row = Math.floor(index / bestColumns);
      const x = marginX + col * (boardW + marginX);
      const y = marginY + row * (boardH + marginY);
      drawBoard(x, y, boardW, boardH, boards[userId], cellSize);
    });
  }

  // Draw UI elements
  drawControlPanel();
  drawSpectateBar();
  drawHamburger();
  drawRankingOverlay();
  drawOverlayMessage();

  requestAnimationFrame(draw);
}

// Helper function to draw individual boards (from original spectator.html)
function drawBoard(x, y, width, height, boardObj, cellSize) {
  ctx.fillStyle = "#333";
  ctx.fillRect(x, y, width, height);
  const cols = 10, rows = 22;
  const cellW = width / cols, cellH = height / rows;
  ctx.strokeStyle = "#555";
  for (let i = 0; i <= cols; i++) {
    ctx.beginPath();
    ctx.moveTo(x + i * cellW, y);
    ctx.lineTo(x + i * cellW, y + height);
    ctx.stroke();
  }
  for (let j = 0; j <= rows; j++) {
    ctx.beginPath();
    ctx.moveTo(x, y + j * cellH);
    ctx.lineTo(x + width, y + j * cellH);
    ctx.stroke();
  }
  if (boardObj.board) {
    for (let r = 0; r < boardObj.board.length; r++) {
      for (let c = 0; c < boardObj.board[r].length; c++) {
        const cell = boardObj.board[r][c];
        if (cell && cell !== 0) {
          ctx.fillStyle = getColor(cell);
          ctx.fillRect(x + c * cellW, y + r * cellH, cellW, cellH);
        }
      }
    }
  }
  ctx.fillStyle = "#fff";
  ctx.font = `${cellSize * 0.8}px Arial`;
  ctx.textAlign = "left";
  ctx.fillText(boardObj.username || "Unknown", x + 4, y + cellSize);

  let effectiveKO = boardObj.isKO;
  if (!effectiveKO && rankingData && rankingData.yourRankMap) {
    if (rankingData.yourRankMap[boardObj.username] !== null) {
      effectiveKO = true;
    }
  }
  if (effectiveKO) {
    ctx.strokeStyle = "red";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, width, height);
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(x, y, width, height);
    ctx.fillStyle = "#FF0000";
    ctx.font = `${cellSize * 2}px Arial`;
    ctx.textAlign = "center";
    ctx.fillText("KO", x + width / 2, y + height / 2);
    ctx.lineWidth = 1;
  }
}

// Helper function to get color (from original spectator.html)
function getColor(letter) {
  const colors = {
    I: "#00f",
    J: "#00a",
    L: "#f80",
    O: "#ff0",
    S: "#0f0",
    T: "#a0a",
    Z: "#f00",
    G: "#888",
  };
  return colors[letter] || "#999";
}

// Initial fetch and start drawing loop
fetchRooms();
requestAnimationFrame(draw);

// Add click event listener to canvas
canvas.addEventListener('click', (event) => {
  const action = handleCanvasClick(event);
  if (action) {
    if (action === "refreshRooms") {
      fetchRooms();
    } else if (action === "hamburgerClick") {
      socket.disconnect();
      location.reload();
    } else if (action.type === "spectateRoom") {
      currentRoomId = action.roomId;
      resetSpectate();
      showControlPanel = false;
      showSpectateBar = true;
      showHamburger = true;
      // spectateInfo is drawn on canvas, no need to update DOM
      socket.emit("spectateRoom", action.roomId);
    }
  }
});

// Socket.IO Event Handlers
socket.on("spectateRoomInfo", (data) => {
  console.log(`観戦中: ${data.roomId}`);
  gameStarted = data.isGameStarted;
});
socket.on("spectateError", (errMsg) => {
  console.error(errMsg);
  // On error, show room list again
  showSpectateBar = false;
  showHamburger = false;
  showControlPanel = true;
});
socket.on("BoardStatus", (data) => {
  const userId = data.userId || data.UserID;
  const name = data.username || userId;
  boards[userId] = boards[userId] || { board: null, username: name, isKO: false };
  boards[userId].board = data.board;
});
socket.on("BoardStatusBulk", (bulkBoards) => {
  Object.keys(bulkBoards).forEach((userId) => {
    const boardData = bulkBoards[userId];
    const name = boardData.username || userId;
    boards[userId] = boards[userId] || { board: null, username: name, isKO: false };
    boards[userId].board = boardData.board;
  });
});
socket.on("ranking", (data) => {
  rankingData = data;
});
socket.on("CountDown", (data) => {
  overlayMessage = `開始まで: ${data}`;
  gameStarted = false;
});
socket.on("StartGame", () => {
  overlayMessage = "ゲーム開始!";
  gameStarted = true;
  setTimeout(() => {
    overlayMessage = null;
  }, 2000);
});
socket.on("GameOver", () => {
  overlayMessage = "ゲーム終了";
  gameStarted = false;
  setTimeout(() => {
    overlayMessage = null;
    showRankingOverlay = true;
    // updateRankingOverlay() will be called by drawRankingOverlay
  }, 3000);
});
socket.on("playerKO", (userId) => {
  if (boards[userId]) {
    boards[userId].isKO = true;
  }
});

// Global state variables for spectator UI
export let currentRoomId = null;
export let boards = {}; // { userId: { board, username, isKO } }
export let rankingData = null;
export let overlayMessage = null;
export let gameStarted = false;
export let showRankingOverlay = false;
export let roomList = []; // To store fetched room data for drawing
export let showControlPanel = true; // To control visibility of room list panel
export let showSpectateBar = false; // To control visibility of spectate info bar
export let showHamburger = false; // To control visibility of hamburger icon

// Function to reset spectator state
export function resetSpectate() {
  boards = {};
  rankingData = null;
  overlayMessage = null;
  gameStarted = false;
  showRankingOverlay = false;
  // No need to hide div, as we will draw on canvas
}

// Room List Fetch
export function fetchRooms() {
  fetch(CONFIG.serverUrl + "/rooms")
    .then((res) => res.json())
    .then((data) => {
      roomList = data.rooms.filter(room => room.playersCount > 0); // Filter out empty rooms
      if (roomList.length === 0) {
        console.log("現在、ルームはありません。");
      }
    })
    .catch((err) => {
      console.error("ルーム情報の取得エラー", err);
      roomList = []; // Clear room list on error
    });
}

// Function to draw the control panel (room list)
export function drawControlPanel() {
  if (!showControlPanel) return;

  const panelWidth = 320;
  const panelPadding = 20;
  const panelX = (canvas.width - panelWidth) / 2;
  const panelY = (canvas.height - (roomList.length * 40 + 100)) / 2; // Approximate height

  ctx.fillStyle = "rgba(255, 255, 255, 0.97)";
  ctx.fillRect(panelX, panelY, panelWidth, roomList.length * 40 + 100); // Adjust height dynamically
  ctx.strokeStyle = "#ccc";
  ctx.strokeRect(panelX, panelY, panelWidth, roomList.length * 40 + 100);

  ctx.fillStyle = "#333";
  ctx.font = "24px Arial";
  ctx.textAlign = "center";
  ctx.fillText("ルーム一覧", canvas.width / 2, panelY + 30);

  let currentY = panelY + 60;
  if (roomList.length === 0) {
    ctx.font = "16px Arial";
    ctx.fillText("現在、ルームはありません。", canvas.width / 2, currentY);
  } else {
    roomList.forEach((room, index) => {
      const buttonText = `ルームID: ${room.roomId} | プレイヤー: ${room.playersCount} | ゲーム開始: ${room.isGameStarted}`;
      const buttonX = panelX + panelPadding;
      const buttonY = currentY;
      const buttonWidth = panelWidth - 2 * panelPadding;
      const buttonHeight = 30;

      // Store button bounds for click detection
      room.buttonBounds = { x: buttonX, y: buttonY, width: buttonWidth, height: buttonHeight };

      ctx.fillStyle = "#007acc";
      ctx.fillRect(buttonX, buttonY, buttonWidth, buttonHeight);
      ctx.fillStyle = "#fff";
      ctx.font = "16px Arial";
      ctx.textAlign = "center";
      ctx.fillText(buttonText, buttonX + buttonWidth / 2, buttonY + buttonHeight / 2 + 5);
      currentY += buttonHeight + 10;
    });
  }

  // Refresh button
  const refreshButtonX = panelX + panelPadding;
  const refreshButtonY = currentY + 10;
  const refreshButtonWidth = panelWidth - 2 * panelPadding;
  const refreshButtonHeight = 30;
  ctx.fillStyle = "#007acc";
  ctx.fillRect(refreshButtonX, refreshButtonY, refreshButtonWidth, refreshButtonHeight);
  ctx.fillStyle = "#fff";
  ctx.font = "16px Arial";
  ctx.textAlign = "center";
  ctx.fillText("更新", refreshButtonX + refreshButtonWidth / 2, refreshButtonY + refreshButtonHeight / 2 + 5);
  // Store refresh button bounds
  exports.refreshButtonBounds = { x: refreshButtonX, y: refreshButtonY, width: refreshButtonWidth, height: refreshButtonHeight };
}

// Function to draw spectate bar
export function drawSpectateBar() {
  if (!showSpectateBar) return;

  const barWidth = 200;
  const barHeight = 40;
  const barX = canvas.width - barWidth - 15;
  const barY = 15;

  ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
  ctx.fillRect(barX, barY, barWidth, barHeight);
  ctx.strokeStyle = "#ccc";
  ctx.strokeRect(barX, barY, barWidth, barHeight);

  ctx.fillStyle = "#333";
  ctx.font = "16px Arial";
  ctx.textAlign = "right";
  ctx.fillText("観戦中...", barX + barWidth - 10, barY + barHeight / 2 + 5);
}

// Function to draw hamburger icon
export function drawHamburger() {
  if (!showHamburger) return;

  const hamX = 15;
  const hamY = 15;
  const hamSize = 30;

  ctx.fillStyle = "#fff";
  ctx.fillRect(hamX, hamY + 4, hamSize, 4);
  ctx.fillRect(hamX, hamY + 13, hamSize, 4);
  ctx.fillRect(hamX, hamY + 22, hamSize, 4);
  // Store hamburger bounds
  exports.hamburgerBounds = { x: hamX, y: hamY, width: hamSize, height: hamSize };
}

// Function to draw ranking overlay
export function drawRankingOverlay() {
  if (!showRankingOverlay) return;

  const panelWidth = 300;
  const panelPadding = 20;
  const panelX = (canvas.width - panelWidth) / 2;
  const panelY = (canvas.height - 400) / 2; // Approximate height

  ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
  ctx.fillRect(panelX, panelY, panelWidth, 400); // Adjust height dynamically
  ctx.strokeStyle = "#fff";
  ctx.strokeRect(panelX, panelY, panelWidth, 400);

  ctx.fillStyle = "#fff";
  ctx.font = "24px Arial";
  ctx.textAlign = "center";
  ctx.fillText("ランキング", canvas.width / 2, panelY + 30);

  let currentY = panelY + 60;
  ctx.font = "16px Arial";
  ctx.fillText(`総人数: ${Object.keys(boards).length}`, canvas.width / 2, currentY);
  currentY += 30;

  if (rankingData && rankingData.yourRankMap) {
    let rankArr = [];
    for (const id in rankingData.yourRankMap) {
      const rank = rankingData.yourRankMap[id];
      if (rank !== null) {
        rankArr.push({ id, rank });
      }
    }
    rankArr.sort((a, b) => a.rank - b.rank);

    rankArr.forEach((item, idx) => {
      ctx.textAlign = "left";
      ctx.fillText(`${idx + 1}. ${item.id} (ランク: ${item.rank})`, panelX + panelPadding, currentY);
      currentY += 25;
    });
  } else {
    ctx.textAlign = "center";
    ctx.fillText("ランキング情報がありません", canvas.width / 2, currentY);
  }
}

// Function to draw overlay messages (countdown, game start/end)
export function drawOverlayMessage() {
  if (overlayMessage) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#fff";
    ctx.font = "50px Arial";
    ctx.textAlign = "center";
    ctx.fillText(overlayMessage, canvas.width / 2, canvas.height / 2);
  }
}

// Click detection for canvas elements
export function handleCanvasClick(event) {
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  // Check for refresh button click
  if (showControlPanel && exports.refreshButtonBounds &&
      x >= exports.refreshButtonBounds.x && x <= exports.refreshButtonBounds.x + exports.refreshButtonBounds.width &&
      y >= exports.refreshButtonBounds.y && y <= exports.refreshButtonBounds.y + exports.refreshButtonBounds.height) {
    console.log("Refresh button clicked!");
    return "refreshRooms";
  }

  // Check for room button clicks
  if (showControlPanel && roomList.length > 0) {
    for (const room of roomList) {
      if (room.buttonBounds &&
          x >= room.buttonBounds.x && x <= room.buttonBounds.x + room.buttonBounds.width &&
          y >= room.buttonBounds.y && y <= room.buttonBounds.y + room.buttonBounds.height) {
        console.log("Room button clicked:", room.roomId);
        return { type: "spectateRoom", roomId: room.roomId };
      }
    }
  }

  // Check for hamburger icon click
  if (showHamburger && exports.hamburgerBounds &&
      x >= exports.hamburgerBounds.x && x <= exports.hamburgerBounds.x + exports.hamburgerBounds.width &&
      y >= exports.hamburgerBounds.y && y <= exports.hamburgerBounds.y + exports.hamburgerBounds.height) {
    console.log("Hamburger icon clicked!");
    return "hamburgerClick";
  }

  return null; // No interactive element clicked
}

// Main drawing loop
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw game boards (if spectating a game)
  let playerIds = Object.keys(boards);
  if (playerIds.length > 100) {
    playerIds = playerIds.slice(0, 100);
  }
  const n = playerIds.length;
  if (n > 0) {
    const marginX = 10, marginY = 10;
    let bestCellSize = 0, bestColumns = 1;
    for (let cols = 1; cols <= n; cols++) {
      const rows = Math.ceil(n / cols);
      const cellSizeCandidate = Math.min(
        (canvas.width - (cols + 1) * marginX) / (cols * 10),
        (canvas.height - (rows + 1) * marginY) / (rows * 22)
      );
      if (cellSizeCandidate > bestCellSize) {
        bestCellSize = cellSizeCandidate;
        bestColumns = cols;
      }
    }
    const cellSize = bestCellSize;
    const boardW = cellSize * 10;
    const boardH = cellSize * 22;
    playerIds.forEach((userId, index) => {
      const col = index % bestColumns;
      const row = Math.floor(index / bestColumns);
      const x = marginX + col * (boardW + marginX);
      const y = marginY + row * (boardH + marginY);
      drawBoard(x, y, boardW, boardH, boards[userId], cellSize);
    });
  }

  // Draw UI elements
  drawControlPanel();
  drawSpectateBar();
  drawHamburger();
  drawRankingOverlay();
  drawOverlayMessage();

  requestAnimationFrame(draw);
}

// Helper function to draw individual boards (from original spectator.html)
function drawBoard(x, y, width, height, boardObj, cellSize) {
  ctx.fillStyle = "#333";
  ctx.fillRect(x, y, width, height);
  const cols = 10, rows = 22;
  const cellW = width / cols, cellH = height / rows;
  ctx.strokeStyle = "#555";
  for (let i = 0; i <= cols; i++) {
    ctx.beginPath();
    ctx.moveTo(x + i * cellW, y);
    ctx.lineTo(x + i * cellW, y + height);
    ctx.stroke();
  }
  for (let j = 0; j <= rows; j++) {
    ctx.beginPath();
    ctx.moveTo(x, y + j * cellH);
    ctx.lineTo(x + width, y + j * cellH);
    ctx.stroke();
  }
  if (boardObj.board) {
    for (let r = 0; r < boardObj.board.length; r++) {
      for (let c = 0; c < boardObj.board[r].length; c++) {
        const cell = boardObj.board[r][c];
        if (cell && cell !== 0) {
          ctx.fillStyle = getColor(cell);
          ctx.fillRect(x + c * cellW, y + r * cellH, cellW, cellH);
        }
      }
    }
  }
  ctx.fillStyle = "#fff";
  ctx.font = `${cellSize * 0.8}px Arial`;
  ctx.textAlign = "left";
  ctx.fillText(boardObj.username || "Unknown", x + 4, y + cellSize);

  let effectiveKO = boardObj.isKO;
  if (!effectiveKO && rankingData && rankingData.yourRankMap) {
    if (rankingData.yourRankMap[boardObj.username] !== null) {
      effectiveKO = true;
    }
  }
  if (effectiveKO) {
    ctx.strokeStyle = "red";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, width, height);
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(x, y, width, height);
    ctx.fillStyle = "#FF0000";
    ctx.font = `${cellSize * 2}px Arial`;
    ctx.textAlign = "center";
    ctx.fillText("KO", x + width / 2, y + height / 2);
    ctx.lineWidth = 1;
  }
}

// Helper function to get color (from original spectator.html)
function getColor(letter) {
  const colors = {
    I: "#00f",
    J: "#00a",
    L: "#f80",
    O: "#ff0",
    S: "#0f0",
    T: "#a0a",
    Z: "#f00",
    G: "#888",
  };
  return colors[letter] || "#999";
}

// Initial fetch and start drawing loop
fetchRooms();
requestAnimationFrame(draw);

// Add click event listener to canvas
canvas.addEventListener('click', (event) => {
  const action = handleCanvasClick(event);
  if (action) {
    if (action === "refreshRooms") {
      fetchRooms();
    } else if (action === "hamburgerClick") {
      socket.disconnect();
      location.reload();
    } else if (action.type === "spectateRoom") {
      currentRoomId = action.roomId;
      resetSpectate();
      showControlPanel = false;
      showSpectateBar = true;
      showHamburger = true;
      // spectateInfo is drawn on canvas, no need to update DOM
      socket.emit("spectateRoom", action.roomId);
    }
  }
});

// Socket.IO Event Handlers
socket.on("spectateRoomInfo", (data) => {
  console.log(`観戦中: ${data.roomId}`);
  gameStarted = data.isGameStarted;
});
socket.on("spectateError", (errMsg) => {
  console.error(errMsg);
  // On error, show room list again
  showSpectateBar = false;
  showHamburger = false;
  showControlPanel = true;
});
socket.on("BoardStatus", (data) => {
  const userId = data.userId || data.UserID;
  const name = data.username || userId;
  boards[userId] = boards[userId] || { board: null, username: name, isKO: false };
  boards[userId].board = data.board;
});
socket.on("BoardStatusBulk", (bulkBoards) => {
  Object.keys(bulkBoards).forEach((userId) => {
    const boardData = bulkBoards[userId];
    const name = boardData.username || userId;
    boards[userId] = boards[userId] || { board: null, username: name, isKO: false };
    boards[userId].board = boardData.board;
  });
});
socket.on("ranking", (data) => {
  rankingData = data;
});
socket.on("CountDown", (data) => {
  overlayMessage = `開始まで: ${data}`;
  gameStarted = false;
});
socket.on("StartGame", () => {
  overlayMessage = "ゲーム開始!";
  gameStarted = true;
  setTimeout(() => {
    overlayMessage = null;
  }, 2000);
});
socket.on("GameOver", () => {
  overlayMessage = "ゲーム終了";
  gameStarted = false;
  setTimeout(() => {
    overlayMessage = null;
    showRankingOverlay = true;
    // updateRankingOverlay() will be called by drawRankingOverlay
  }, 3000);
});
socket.on("playerKO", (userId) => {
  if (boards[userId]) {
    boards[userId].isKO = true;
  }
});
