
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { initializeSocket, handleSocketConnection } = require("./server/socket/index.js");
const { rooms, trackSocketConnection } = require("./server/room.js");
const EventEmitter = require('events');

// --- Bot Configuration ---
const ENABLE_BOTS = true;
const BOT_COUNT = 98;
// -------------------------

const PORT = process.env.PORT || 6000;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingInterval: 25000,
  pingTimeout: 20000,
  transports: ['websocket', 'polling']
});

app.use(cors());
app.use(express.static("public"));

app.get("/rooms", (req, res) => {
  const roomInfo = [...rooms.values()]
    .filter(room => room.players.size > 0 && !room.isGameOver)
    .map(room => ({
      roomId: room.roomId,
      playersCount: room.players.size,
      isGameStarted: room.isGameStarted,
      isPrivate: room.isPrivate
    }));
  res.json({ rooms: roomInfo });
});

const Database = require("./server/database.js");
const { RateLimiterMemory } = require('rate-limiter-flexible');

// レートリミッターの設定 (1IPあたり1時間に5回まで登録可能)
const registrationLimiter = new RateLimiterMemory({
  points: 5,
  duration: 3600, 
});

// ログイン試行制限 (1IPあたり1分に10回まで)
const loginLimiter = new RateLimiterMemory({
  points: 10,
  duration: 60,
});

initializeSocket(io);

io.on('connection', (socket) => {
  const ip = socket.handshake.address;

  socket.on('register', async (data) => {
    try {
      await registrationLimiter.consume(ip);
      
      // 同一IPからの登録をチェック
      const existingAccount = await Database.getAccountByIp(ip);
      if (existingAccount) {
        return socket.emit('register_error', { message: 'このネットワークからは既にアカウントが作成されています（1人1アカウント制限）。' });
      }

      const user = await Database.createUser(data.username, data.password, data.nickname, ip);
      socket.emit('register_success', { user });
    } catch (err) {
      const message = err.msBeforeNext 
        ? `リクエストが多すぎます。${Math.round(err.msBeforeNext / 1000 / 60)}分後に再試行してください。`
        : (err.message || 'エラーが発生しました。');
      socket.emit('register_error', { message });
    }
  });

  socket.on('login', async (data) => {
    try {
      await loginLimiter.consume(ip);
      const user = await Database.verifyUser(data.username, data.password);
      if (user) {
        socket.user = user;
        socket.emit('login_success', { user });
      } else {
        socket.emit('login_error', { message: 'ユーザー名またはパスワードが正しくありません。' });
      }
    } catch (err) {
      const message = err.msBeforeNext 
        ? 'ログイン試行回数が多すぎます。しばらく待ってから再試行してください。'
        : 'エラーが発生しました。';
      socket.emit('login_error', { message });
    }
  });

  socket.on('update_settings', async (data) => {
    if (!socket.user) return;
    try {
      // data.settings にはキーバインドと色情報が含まれる想定
      await Database.updateUserSettings(socket.user.username, data.nickname, data.settings);
      socket.user.nickname = data.nickname;
      socket.user.settings = data.settings;
      socket.emit('settings_updated', { user: socket.user });
    } catch (err) {
      socket.emit('settings_error', { message: '設定の更新に失敗しました。' });
    }
  });
});

// --- Bot Initialization ---
if (ENABLE_BOTS) {
    const { bots } = require('./server/bots.js');
    const { BlockBot, BASE_AI_PARAMETERS } = require('./bot/bot.js');
    const { setIoReference } = require('./server/room.js'); // Import the function

    console.log(`🤖 Initializing ${BOT_COUNT} bots...`);

    // Set the io reference for room timeout functionality
    setIoReference(io);

    for (let i = 0; i < BOT_COUNT; i++) {
        const botSocket = new EventEmitter();
        botSocket.id = `bot_${i}`;
        botSocket.isBot = true; // Flag to identify bot sockets

        botSocket.join = (roomId) => {
            if (!botSocket.rooms) botSocket.rooms = new Set();
            botSocket.rooms.add(roomId);
        };
        botSocket.leave = (roomId) => {
            if (botSocket.rooms) botSocket.rooms.delete(roomId);
        };

        bots.set(botSocket.id, botSocket);

        new BlockBot(i, Math.floor(Math.random() * 101), BASE_AI_PARAMETERS, botSocket);

        handleSocketConnection(io, botSocket);

        // Track bot socket connection
        trackSocketConnection(botSocket.id);

        setImmediate(() => {
            botSocket.emit('matching');
        });
    }
    console.log('🤖 All bots initialized.');
}
// --------------------------

server.listen(PORT, () => {
  console.log(`🔥 Server running: http://localhost:${PORT}`);
});
