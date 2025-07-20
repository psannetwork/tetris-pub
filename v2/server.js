// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const PORT = process.env.PORT || 6000;
const MAX_PLAYERS = 99;
const MIN_PLAYERS_TO_START = 2;
const COUNTDOWN_START = 10; // カウントダウン初期値

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingInterval: 10000,
  pingTimeout: 5000,
  transports: ['websocket', 'polling']
});

app.use(cors());
app.use(express.static("public"));

// --- ルーム管理 ---
// rooms: roomId → プレイヤー用ルームオブジェクト
const rooms = new Map();
// playerRoom: socket.id → roomId（プレイヤーのみ登録）
const playerRoom = new Map();
// playerRanks: roomId → ゲームオーバー順のプレイヤーID配列
const playerRanks = new Map();
// spectators: roomId → Set(観戦者socket.id)
const spectators = new Map();
let roomCounter = 0;

function createRoom(playerId) {
  roomCounter++;
  const roomId = `room_${roomCounter}`;
  const room = {
    roomId,
    players: new Set([playerId]),
    initialPlayers: new Set([playerId]),
    isCountingDown: false,
    isGameStarted: false,
    isGameOver: false,
    totalPlayers: null,
    boards: {}, // 各プレイヤーの最新ボード状態を保持
    countdownCount: COUNTDOWN_START,
    countdownInterval: null
  };
  rooms.set(roomId, room);
  return room;
}

function getAvailableRoom() {
  for (const room of rooms.values()) {
    if (!room.isGameStarted && !room.isGameOver && room.players.size < MAX_PLAYERS) {
      return room;
    }
  }
  return null;
}

// 観戦者へのイベント送信（プレイヤーとは別ルート）
function emitToSpectators(roomId, event, data) {
  if (spectators.has(roomId)) {
    for (const specId of spectators.get(roomId)) {
      io.to(specId).emit(event, data);
    }
  }
}

function startCountdown(room) {
  if (!room || room.isCountingDown || room.isGameStarted) return;
  room.isCountingDown = true;
  room.countdownCount = COUNTDOWN_START;

  console.log(`⏳ Room ${room.roomId} countdown started.`);
  room.countdownInterval = setInterval(() => {
    // ルームが存在しない場合キャンセル
    if (!rooms.has(room.roomId)) {
      clearInterval(room.countdownInterval);
      return;
    }
    // プレイヤーが最低人数未満なら待機メッセージ
    if (room.players.size < MIN_PLAYERS_TO_START) {
      // カウントリセット: 1人になったときのみ
      if (room.players.size === 1 && room.countdownCount !== COUNTDOWN_START) {
        room.countdownCount = COUNTDOWN_START;
        console.log(`🔄 Room ${room.roomId} countdown reset.`);
      }
      const msg = "プレイヤーを待機中です...";
      io.to(room.roomId).emit("CountDown", msg);
      emitToSpectators(room.roomId, "CountDown", msg);
      return;
    }

    // カウント通知
    io.to(room.roomId).emit("CountDown", room.countdownCount);
    emitToSpectators(room.roomId, "CountDown", room.countdownCount);
    console.log(`⏳ Room ${room.roomId} countdown: ${room.countdownCount}`);
    room.countdownCount--;

    // カウント終了または最大プレイヤー達成時にゲーム開始
    if (room.countdownCount < 0 || room.players.size >= MAX_PLAYERS) {
      clearInterval(room.countdownInterval);
      room.isCountingDown = false;
      room.isGameStarted = true;
      room.totalPlayers = room.initialPlayers.size;
      io.to(room.roomId).emit("StartGame");
      emitToSpectators(room.roomId, "StartGame");
      console.log(`🎮 Room ${room.roomId} game started (totalPlayers: ${room.totalPlayers}).`);
    }
  }, 1000);
}

function handleGameOver(socket, reason) {
  const roomId = playerRoom.get(socket.id);
  if (!roomId || !rooms.has(roomId)) return;
  const room = rooms.get(roomId);

  // 既にゲーム終了している場合は無視
  if (room.isGameOver) return;

  // ランク登録
  if (!playerRanks.has(roomId)) playerRanks.set(roomId, []);
  const ranks = playerRanks.get(roomId);
  if (!ranks.includes(socket.id)) ranks.push(socket.id);

  // プレイヤー部屋解除
  playerRoom.delete(socket.id);

  const totalPlayers = room.totalPlayers || room.initialPlayers.size;
  
  // 最終プレイヤー処理
  if (ranks.length === totalPlayers - 1) {
    const remaining = [...room.initialPlayers].find(id => !ranks.includes(id));
    if (remaining) ranks.push(remaining);

    const yourRankMap = Object.fromEntries(
      [...room.initialPlayers].map(id => [id, totalPlayers - ranks.indexOf(id)])
    );

    io.to(room.roomId).emit("ranking", { ranking: ranks, yourRankMap });
    emitToSpectators(room.roomId, "ranking", { ranking: ranks, yourRankMap });
    io.to(room.roomId).emit("GameOver");
    emitToSpectators(room.roomId, "GameOver");

    room.isGameOver = true;
    // 30秒後にルーム削除
    setTimeout(() => {
      // 観戦者も削除
      spectators.delete(roomId);
      rooms.delete(roomId);
      playerRanks.delete(roomId);
      console.log(`🗑️ Room ${roomId} deleted after game over.`);
    }, 30000);
    return;
  }

  // 一般的なKO通知
  const yourRankMap = Object.fromEntries(
    [...room.initialPlayers].map(id => [
      id,
      ranks.includes(id)
        ? totalPlayers - ranks.indexOf(id)
        : (ranks.length === totalPlayers - 1 ? 1 : null)
    ])
  );

  io.to(room.roomId).emit("ranking", { ranking: ranks, yourRankMap });
  io.to(room.roomId).emit("playerKO", socket.id);
  emitToSpectators(room.roomId, "ranking", { ranking: ranks, yourRankMap });
  emitToSpectators(room.roomId, "playerKO", socket.id);
}

// --- API ---
app.get("/rooms", (req, res) => {
  const roomInfo = [...rooms.values()]
    .filter(room => room.players.size > 0 && !room.isGameOver)
    .map(room => ({
      roomId: room.roomId,
      playersCount: room.players.size,
      isGameStarted: room.isGameStarted
    }));
  res.json({ rooms: roomInfo });
});

// --- Socket.IO イベント ---
io.on("connection", (socket) => {
  console.log("🚀 User connected:", socket.id);

  socket.on("matching", () => {
    let room = getAvailableRoom();
    if (room) {
      room.players.add(socket.id);
      room.initialPlayers.add(socket.id);
      console.log(`🏠 ${socket.id} joined ${room.roomId}`);
    } else {
      room = createRoom(socket.id);
      console.log(`🏠 ${socket.id} created new room ${room.roomId}`);
    }
    playerRoom.set(socket.id, room.roomId);
    socket.join(room.roomId);
    io.to(room.roomId).emit("roomInfo", {
      roomId: room.roomId,
      members: [...room.players]
    });
    // ゲーム開始前のみカウントダウンを開始
    if (!room.isGameStarted && !room.isCountingDown) {
      startCountdown(room);
    }
  });

  socket.on("spectateRoom", (roomId) => {
    if (!rooms.has(roomId)) {
      return socket.emit("spectateError", `指定されたルーム (${roomId}) は存在しません。`);
    }
    const room = rooms.get(roomId);
    if (room.players.size === 0 || room.isGameOver) {
      return socket.emit("spectateError", `指定されたルーム (${roomId}) は終了しています。`);
    }
    if (playerRoom.has(socket.id)) {
      // プレイヤーから観戦者へ切り替え
      const prev = playerRoom.get(socket.id);
      const prevRoom = rooms.get(prev);
      prevRoom.players.delete(socket.id);
      prevRoom.initialPlayers.delete(socket.id);
      playerRoom.delete(socket.id);
      socket.leave(prev);
      
      // ゲーム中であればゲームオーバー処理
      if (prevRoom.isGameStarted) {
        handleGameOver(socket, "spectating");
      }
      
      console.log(`🔄 ${socket.id} converted from player to spectator for ${roomId}`);
    }
    if (!spectators.has(roomId)) spectators.set(roomId, new Set());
    spectators.get(roomId).add(socket.id);

    socket.join(roomId);
    socket.emit("spectateRoomInfo", {
      roomId: room.roomId,
      playersCount: room.players.size,
      isGameStarted: room.isGameStarted
    });
    socket.emit("BoardStatusBulk", room.boards);
    console.log(`👀 ${socket.id} is spectating ${roomId}`);
  });

  socket.on("BoardStatus", (board) => {
    const roomId = playerRoom.get(socket.id);
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room || room.isGameOver) return;
    
    room.boards[socket.id] = board;
    socket.to(roomId).emit("BoardStatus", board);
    emitToSpectators(roomId, "BoardStatus", board);
  });

  socket.on("PlayerGameStatus", (status) => {
    if (status.includes("gameover")) {
      handleGameOver(socket, "normal");
    }
  });

  socket.on("SendGarbage", ({ targetId, lines }) => {
    const roomId = playerRoom.get(socket.id);
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room || room.isGameOver || room.players.size <= 1) return;
    
    const gameOver = playerRanks.get(roomId) || [];
    let recipient = targetId;
    const members = [...room.players];
    if (!recipient || !members.includes(recipient) || gameOver.includes(recipient)) {
      const candidates = members.filter(id => id !== socket.id && !gameOver.includes(id));
      if (!candidates.length) return;
      recipient = candidates[Math.floor(Math.random() * candidates.length)];
    }
    io.to(recipient).emit("ReceiveGarbage", { from: socket.id, lines });
    console.log(`💥 ${socket.id} sent ${lines} garbage to ${recipient} in ${roomId}`);
  });

  socket.on("disconnect", (reason) => {
    const roomId = playerRoom.get(socket.id);
    if (roomId && rooms.has(roomId)) {
      const room = rooms.get(roomId);
      // 切断時はゲームオーバー扱い
      if (room.isGameStarted) {
        handleGameOver(socket, reason);
      } else if (room.isCountingDown) {
        // カウント中の切断
        room.players.delete(socket.id);
        room.initialPlayers.delete(socket.id);
        playerRoom.delete(socket.id);
        console.log(`🔌 ${socket.id} disconnected during countdown (${reason}).`);
      } else {
        room.players.delete(socket.id);
        room.initialPlayers.delete(socket.id);
        playerRoom.delete(socket.id);
      }
      // ルームが空なら削除
      if (room.players.size === 0) {
        clearInterval(room.countdownInterval);
        // 観戦者も削除
        spectators.delete(roomId);
        setTimeout(() => rooms.delete(roomId), 5000);
      }
    }
    // 観戦者のクリーンアップ
    for (const [rId, set] of spectators.entries()) {
      if (set.delete(socket.id) && set.size === 0) spectators.delete(rId);
    }
    console.log(`❌ ${socket.id} disconnected (${reason}).`);
  });
});

server.listen(PORT, () => {
  console.log(`🔥 Server running: http://localhost:${PORT}`);
});