
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { initializeSocket } = require("./server/socket.js");
const { rooms } = require("./server/room.js");

const PORT = process.env.PORT || 6000;

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

server.listen(PORT, () => {
  console.log(`🔥 Server running: http://localhost:${PORT}`);
});
