
const {
    rooms,
    playerRoom,
    playerRanks,
    spectators,
    createRoom,
    getAvailableRoom,
    emitToSpectators,
    startCountdown,
    handleGameOver
} = require('./room.js');

function initializeSocket(io) {
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
            if (!room.isGameStarted && !room.isCountingDown) {
                startCountdown(io, room);
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
                const prev = playerRoom.get(socket.id);
                const prevRoom = rooms.get(prev);
                prevRoom.players.delete(socket.id);
                prevRoom.initialPlayers.delete(socket.id);
                playerRoom.delete(socket.id);
                socket.leave(prev);

                if (prevRoom.isGameStarted) {
                    handleGameOver(io, socket, "spectating");
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
            emitToSpectators(io, roomId, "BoardStatus", board);
        });

        socket.on("PlayerGameStatus", (status) => {
            if (status.includes("gameover")) {
                handleGameOver(io, socket, "normal");
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
                if (room.isGameStarted) {
                    handleGameOver(io, socket, reason);
                } else if (room.isCountingDown) {
                    room.players.delete(socket.id);
                    room.initialPlayers.delete(socket.id);
                    playerRoom.delete(socket.id);
                    console.log(`🔌 ${socket.id} disconnected during countdown (${reason}).`);
                } else {
                    room.players.delete(socket.id);
                    room.initialPlayers.delete(socket.id);
                    playerRoom.delete(socket.id);
                }
                if (room.players.size === 0) {
                    clearInterval(room.countdownInterval);
                    spectators.delete(roomId);
                    setTimeout(() => rooms.delete(roomId), 5000);
                }
            }
            for (const [rId, set] of spectators.entries()) {
                if (set.delete(socket.id) && set.size === 0) spectators.delete(rId);
            }
            console.log(`❌ ${socket.id} disconnected (${reason}).`);
        });
    });
}

module.exports = { initializeSocket };