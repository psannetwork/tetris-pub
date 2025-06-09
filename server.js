// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const PORT = process.env.PORT || 6000;
const MAX_PLAYERS = 99;
const MIN_PLAYERS_TO_START = 2;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(cors());
app.use(express.static("public"));

// --- ルーム管理 ---
// rooms: roomId → プレイヤー用ルームオブジェクト
// playerRoom: socket.id → roomId（プレイヤーのみ登録）
const rooms = new Map();
const playerRoom = new Map();
const playerRanks = new Map(); // roomId → ゲームオーバー順のプレイヤーID配列
let roomCounter = 0;

// spectators: roomId → Set(観戦者socket.id)
const spectators = new Map();

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
    boards: {} // 各プレイヤーの最新ボード状態を保持
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
  if (!room || room.isCountingDown) return;
  room.isCountingDown = true;
  let count = 10;
  console.log(`⏳ Room ${room.roomId} countdown started.`);

  const countdownInterval = setInterval(() => {
    if (!rooms.has(room.roomId)) {
      clearInterval(countdownInterval);
      console.log(`🛑 Room ${room.roomId} deleted, stopping countdown.`);
      return;
    }
    if (room.players.size < MIN_PLAYERS_TO_START) {
      const msg = "プレイヤーを待機中です...";
      io.to(room.roomId).emit("CountDown", msg);
      emitToSpectators(room.roomId, "CountDown", msg);
      console.log(`⏳ Room ${room.roomId} waiting for players (${room.players.size} present).`);
      return;
    }
    io.to(room.roomId).emit("CountDown", count);
    emitToSpectators(room.roomId, "CountDown", count);
    console.log(`⏳ Room ${room.roomId} countdown: ${count}`);
    count--;
    if (count < 0 || room.players.size >= MAX_PLAYERS) {
      clearInterval(countdownInterval);
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

  if (!playerRanks.has(roomId)) {
    playerRanks.set(roomId, []);
  }
  const ranks = playerRanks.get(roomId);
  if (!ranks.includes(socket.id)) {
    ranks.push(socket.id);
    const totalPlayers = room.totalPlayers || room.initialPlayers.size;
    const orderIndex = ranks.indexOf(socket.id) + 1;
    const yourRank = totalPlayers - orderIndex + 1;
    console.log(`💀 ${socket.id} in ${roomId} game over (order: ${orderIndex}, rank: ${yourRank}, reason: ${reason})`);
  }

  // KO時はプレイヤーからは削除するが、board 状態は room.boards に保持する
  playerRoom.delete(socket.id);

  // ランキングマップの再計算
  const totalPlayers = room.totalPlayers || room.initialPlayers.size;
  const yourRankMap = Object.fromEntries(
    Array.from(room.initialPlayers).map(playerId => {
      if (ranks.includes(playerId)) {
        const orderIndex = ranks.indexOf(playerId) + 1;
        return [playerId, totalPlayers - orderIndex + 1];
      } else {
        // 残り一人なら自動的に 1 位
        return [playerId, (ranks.length === totalPlayers - 1) ? 1 : null];
      }
    })
  );

  // 自動で1位を確定する処理
  if (ranks.length === totalPlayers - 1) {
    const remaining = Array.from(room.initialPlayers).find(id => !ranks.includes(id));
    if (remaining) {
      ranks.push(remaining);
      yourRankMap[remaining] = 1;
    }
    console.log(`🏁 Room ${roomId} game ended automatically. Final ranking:`, yourRankMap);
    io.to(room.roomId).emit("ranking", { ranking: ranks, yourRankMap });
    emitToSpectators(room.roomId, "ranking", { ranking: ranks, yourRankMap });
    io.to(room.roomId).emit("GameOver");
    emitToSpectators(room.roomId, "GameOver");
    room.isGameOver = true;
    // ルームは30秒間保持して、観戦者が最終ボードを確認できるようにする
    setTimeout(() => {
      rooms.delete(roomId);
      playerRanks.delete(roomId);
      console.log(`🗑️ Room ${roomId} deleted after game over.`);
    }, 30000);
    return;
  }

  // 通常時は、ランキングとKO情報を送信
  io.to(room.roomId).emit("ranking", { ranking: ranks, yourRankMap });
  io.to(room.roomId).emit("playerKO", socket.id);
  emitToSpectators(room.roomId, "ranking", { ranking: ranks, yourRankMap });
  emitToSpectators(room.roomId, "playerKO", socket.id);
}

// --- API ---
app.get("/rooms", (req, res) => {
  // ゲーム終了済みのルームは一覧に表示しない
  const roomInfo = Array.from(rooms.values())
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

  // プレイヤーとしてのマッチング
  socket.on("matching", () => {
    let room = getAvailableRoom();
    if (room) {
      room.players.add(socket.id);
      room.initialPlayers.add(socket.id);
      console.log(`🏠 ${socket.id} joined ${room.roomId}`);
    } else {
      room = createRoom(socket.id);
      console.log(`🏠 ${socket.id} created new room ${room.roomId}`);
      startCountdown(room);
    }
    playerRoom.set(socket.id, room.roomId);
    socket.join(room.roomId);
    io.to(room.roomId).emit("roomInfo", {
      roomId: room.roomId,
      members: Array.from(room.players)
    });
  });

  // 観戦用：もしプレイヤーとして参加中ならルームから離脱し、観戦者として登録
  socket.on("spectateRoom", (roomId) => {
    if (!rooms.has(roomId)) {
      socket.emit("spectateError", `指定されたルーム (${roomId}) は存在しません。`);
      return;
    }
    const room = rooms.get(roomId);
    if (room.players.size === 0) {
      socket.emit("spectateError", `指定されたルーム (${roomId}) は既に終了しています。`);
      return;
    }
    // もしプレイヤーとして登録されているなら、観戦者へ切り替える
    if (playerRoom.has(socket.id)) {
      const prevRoomId = playerRoom.get(socket.id);
      if (rooms.has(prevRoomId)) {
        const prevRoom = rooms.get(prevRoomId);
        prevRoom.players.delete(socket.id);
        prevRoom.initialPlayers.delete(socket.id);
      }
      playerRoom.delete(socket.id);
      socket.leave(roomId);
      console.log(`🔄 ${socket.id} was converted from player to spectator for room ${roomId}`);
    }
    if (!spectators.has(roomId)) {
      spectators.set(roomId, new Set());
    }
    spectators.get(roomId).add(socket.id);
    socket.emit("spectateRoomInfo", {
      roomId: room.roomId,
      playersCount: room.players.size,
      isGameStarted: room.isGameStarted
    });
    // 観戦者に対して、既存の全プレイヤーのボード情報を一括送信
    socket.emit("BoardStatusBulk", room.boards);
    console.log(`👀 ${socket.id} is spectating ${roomId}`);
  });

  // プレイヤーからのボード更新（常に room.boards に保持）
  socket.on("BoardStatus", (board) => {
    const roomId = playerRoom.get(socket.id);
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (room) {
      room.boards[socket.id] = board;
    }
    // 送信元以外のプレイヤーへおよび観戦者へ送信
    socket.to(roomId).emit("BoardStatus", board);
    emitToSpectators(roomId, "BoardStatus", board);
  });

  socket.on("PlayerGameStatus", (status) => {
    const roomId = playerRoom.get(socket.id);
    if (!roomId) return;
    if (status.includes("gameover")) {
      handleGameOver(socket, "normal");
    }
  });

  socket.on("SendGarbage", ({ targetId, lines }) => {
    const roomId = playerRoom.get(socket.id);
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room || room.players.size <= 1) return;
    const gameOverPlayers = playerRanks.get(roomId) || [];
    let recipientId = targetId;
    const members = Array.from(room.players);
    if (!recipientId || !members.includes(recipientId) || gameOverPlayers.includes(recipientId)) {
      const candidates = members.filter(id => id !== socket.id && !gameOverPlayers.includes(id));
      if (candidates.length === 0) {
        console.log(`💥 有効な送り先が見つからなかったため、${socket.id}の SendGarbage をスキップしました。`);
        return;
      }
      recipientId = candidates[Math.floor(Math.random() * candidates.length)];
    }
    io.to(recipientId).emit("ReceiveGarbage", { from: socket.id, lines });
    console.log(`💥 ${socket.id} sent ${lines} garbage lines to ${recipientId} in ${roomId}`);
  });

  socket.on("error", (err) => {
    console.error(`⚠️ Socket error (${socket.id}):`, err);
    handleGameOver(socket, "error");
  });

  socket.on("disconnect", (reason) => {
    // プレイヤー用の処理
    const roomId = playerRoom.get(socket.id);
    if (roomId && rooms.has(roomId)) {
      const room = rooms.get(roomId);
      const errorReasons = ["ping timeout", "transport error", "transport close", "server disconnect"];
      if (errorReasons.includes(reason)) {
        console.log(`🚨 ${socket.id} encountered error (${reason}), treated as game over.`);
        handleGameOver(socket, reason);
      } else {
        room.players.delete(socket.id);
        playerRoom.delete(socket.id);
        console.log(`❌ ${socket.id} left ${roomId} voluntarily (${reason}).`);
        if (room.players.size === 0) {
          console.log(`🗑️ Room ${roomId} will be deleted in 5 seconds (empty).`);
          setTimeout(() => {
            if (rooms.has(roomId) && room.players.size === 0) {
              rooms.delete(roomId);
              console.log(`🗑️ Room ${roomId} deleted.`);
            }
          }, 5000);
        }
      }
    }
    // 観戦者用の処理
    for (const [rId, specSet] of spectators.entries()) {
      if (specSet.has(socket.id)) {
        specSet.delete(socket.id);
        if (specSet.size === 0) {
          spectators.delete(rId);
        }
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`🔥 Server running: http://localhost:${PORT}`);
});
