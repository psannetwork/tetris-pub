import { CONFIG } from './config.js';
import { setupCanvases } from './draw.js';
import { addOpponent, removeOpponent, updateSlotBoard } from './online.js';

// We'll access miniboardSlots through the functions
import { miniboardSlots } from './online.js';

// Socket connection for spectator
const socket = io(CONFIG.serverUrl);

// Global state for spectator UI
let currentRoomId = null;
let boards = {}; // { userId: board }
let rankingData = null;
let gameStarted = false;
let roomList = [];
let isSpectating = false;

// DOM elements
const spectatorControls = document.getElementById('spectator-controls');
const roomListElement = document.getElementById('room-list');
const refreshBtn = document.getElementById('refresh-btn');
const backBtn = document.getElementById('back-btn');
const spectateInfo = document.getElementById('spectate-info');
const hamburgerIcon = document.getElementById('hamburger-icon');

// Initialize game canvases
setupCanvases();

// Fetch room list
function fetchRooms() {
  fetch(CONFIG.serverUrl + "/rooms")
    .then((res) => res.json())
    .then((data) => {
      roomList = data.rooms.filter(room => room.playersCount > 0); // Show all rooms with players
      renderRoomList();
    })
    .catch((err) => {
      console.error("ルーム情報の取得エラー", err);
      roomList = [];
      renderRoomList();
    });
}

// Render room list to DOM
function renderRoomList() {
  roomListElement.innerHTML = '';

  if (roomList.length === 0) {
    const noRoomsMsg = document.createElement('div');
    noRoomsMsg.className = 'room-item';
    noRoomsMsg.textContent = '現在、ルームはありません。';
    noRoomsMsg.style.background = '#ccc';
    noRoomsMsg.style.cursor = 'default';
    roomListElement.appendChild(noRoomsMsg);
  } else {
    roomList.forEach((room) => {
      const roomItem = document.createElement('div');
      roomItem.className = 'room-item';
      roomItem.textContent = `ID: ${room.roomId} | Players: ${room.playersCount} | Started: ${room.isGameStarted ? '済' : '待機'}`;

      roomItem.addEventListener('click', () => {
        spectateRoom(room.roomId);
      });

      roomListElement.appendChild(roomItem);
    });
  }
}

// Spectate a room
function spectateRoom(roomId) {
  currentRoomId = roomId;

  // Hide control panel and show spectate info
  spectatorControls.style.display = 'none';
  spectateInfo.style.display = 'block';
  spectateInfo.textContent = `観戦中: ${roomId}`;
  hamburgerIcon.style.display = 'block';

  isSpectating = true;

  // Clear existing miniboards
  miniboardSlots.forEach(slot => {
    if (slot.userId) {
      slot.userId = null;
      slot.boardState.forEach(row => row.fill(0));
      slot.dirty = true;
    }
  });

  // Join the room as spectator
  socket.emit("spectateRoom", roomId);
}

// Show control panel (return to room selection)
function showControlPanel() {
  spectatorControls.style.display = 'block';
  spectateInfo.style.display = 'none';
  hamburgerIcon.style.display = 'none';

  isSpectating = false;
  currentRoomId = null;

  // Clear boards and miniboards when leaving a room
  boards = {};
  miniboardSlots.forEach(slot => {
    if (slot.userId) {
      slot.userId = null;
      slot.boardState.forEach(row => row.fill(0));
      slot.dirty = true;
    }
  });
}

// Refresh room list
refreshBtn.addEventListener('click', fetchRooms);

// Back button event
backBtn.addEventListener('click', showControlPanel);

// Hamburger icon event
hamburgerIcon.addEventListener('click', () => {
  socket.disconnect();
  location.reload();
});

// Socket event handlers
socket.on("connect", () => {
  console.log("観戦用にサーバーに接続:", socket.id);
  fetchRooms(); // Initial fetch of rooms
});

socket.on("spectateRoomInfo", (data) => {
  console.log(`観戦中: ${data.roomId}`);
  spectateInfo.textContent = `観戦中: ${data.roomId} | Players: ${data.playersCount}`;
  gameStarted = data.isGameStarted;
});

socket.on("BoardStatus", (data) => {
  const userId = data.UserID || data.userId;
  if (userId && data.board) {
    // Update the board for this user
    boards[userId] = data.board;

    // Add opponent to miniboard if not already present
    let slot = miniboardSlots.find(s => s.userId === userId);
    if (!slot) {
      addOpponent(userId);
      slot = miniboardSlots.find(s => s.userId === userId);
    }

    if (slot) {
      updateSlotBoard(slot, data.board, data.diff);
    }
  }
});

socket.on("BoardStatusBulk", (bulkBoards) => {
  // Update all boards at once
  for (const userId in bulkBoards) {
    const boardData = bulkBoards[userId];
    if (boardData && boardData.board) {
      boards[userId] = boardData.board;

      // Add opponent to miniboard if not already present
      let slot = miniboardSlots.find(s => s.userId === userId);
      if (!slot) {
        addOpponent(userId);
        slot = miniboardSlots.find(s => s.userId === userId);
      }

      if (slot) {
        updateSlotBoard(slot, boardData.board, boardData.diff);
      }
    }
  }
});

socket.on("ranking", (data) => {
  rankingData = data;

  // Update KO status for each player based on ranking data
  if (data.yourRankMap) {
    for (const userId in data.yourRankMap) {
      const rank = data.yourRankMap[userId];
      if (rank !== null && rank > 1) {
        // Player is KO'd, find their slot and update isGameOver
        const slot = miniboardSlots.find(s => s.userId === userId);
        if (slot && !slot.isGameOver) {
          slot.isGameOver = true;
          slot.dirty = true;
        }
      } else if (rank !== null && rank === 1) {
        // Player is still in the game (rank 1 means still playing)
        const slot = miniboardSlots.find(s => s.userId === userId);
        if (slot && slot.isGameOver) {
          slot.isGameOver = false;
          slot.dirty = true;
        }
      }
    }
  }
});

socket.on("CountDown", (count) => {
  console.log("Countdown:", count);
});

socket.on("StartGame", () => {
  gameStarted = true;
  console.log("Game started");
});

socket.on("GameOver", () => {
  gameStarted = false;
  console.log("Game over");
});

socket.on("ReceiveGarbage", (data) => {
  // Handle garbage attacks for visual effects
  console.log("ReceiveGarbage:", data);
});

socket.on("PlayerDisconnected", (data) => {
  const userId = data.userId;
  if (userId) {
    delete boards[userId];
    removeOpponent(userId);
  }
});

// Initialize spectator functionality
fetchRooms();