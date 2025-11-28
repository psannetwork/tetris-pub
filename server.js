
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { initializeSocket, handleSocketConnection } = require("./server/socket.js");
const { rooms } = require("./server/room.js");
const EventEmitter = require('events');

// --- Bot Configuration ---
const ENABLE_BOTS = true;
const BOT_COUNT = 10;
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
      isGameStarted: room.isGameStarted
    }));
  res.json({ rooms: roomInfo });
});

initializeSocket(io);

// --- Bot Initialization ---
if (ENABLE_BOTS) {
    const { bots } = require('./server/bots.js');
    const { TetrisBot, BASE_AI_PARAMETERS } = require('./bot/bot.js');

    console.log(`🤖 Initializing ${BOT_COUNT} bots...`);

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

        new TetrisBot(i, Math.floor(Math.random() * 101), BASE_AI_PARAMETERS, botSocket);

        handleSocketConnection(io, botSocket);

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
