const {
    rooms,
    playerRoom,
    playerRanks,
    spectators,
    createRoom,
    getAvailableRoom,
    emitToSpectators,
    startCountdown,
    handleGameOver,
    emitToRoom
} = require('./room.js');
const { bots } = require('./bots.js');

function handleSocketConnection(io, socket) {
    console.log("🚀 User connected:", socket.id);

    socket.on("matching", () => {
        const oldRoomId = playerRoom.get(socket.id);
        if (oldRoomId && rooms.has(oldRoomId)) {
            const oldRoom = rooms.get(oldRoomId);
            oldRoom.players.delete(socket.id);
            oldRoom.initialPlayers.delete(socket.id);
        }

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

        emitToRoom(io, room, "roomInfo", {
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
            const prevRoomId = playerRoom.get(socket.id);
            const prevRoom = rooms.get(prevRoomId);
            if (prevRoom) {
                prevRoom.players.delete(socket.id);
                prevRoom.initialPlayers.delete(socket.id);
                if (prevRoom.isGameStarted) {
                    handleGameOver(io, socket, "spectating");
                }
            }
            playerRoom.delete(socket.id);
            socket.leave(prevRoomId);
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
        if (!roomId || !rooms.has(roomId)) return;
        const room = rooms.get(roomId);
        if (!room || room.isGameOver) return;

        room.boards[socket.id] = board;

        for (const playerId of room.players) {
            if (playerId === socket.id || bots.has(playerId)) continue;
            io.to(playerId).emit("BoardStatus", board);
        }
        emitToSpectators(io, roomId, "BoardStatus", board);
    });

    socket.on("PlayerGameStatus", (status) => {
        if (status.includes("gameover")) {
            handleGameOver(io, socket, "normal");
        }
    });

    socket.on("SendGarbage", ({ targetId, lines }) => {
        const roomId = playerRoom.get(socket.id);
        if (!roomId || !rooms.has(roomId)) return;
        const room = rooms.get(roomId);
        if (!room || room.isGameOver || room.players.size <= 1) return;

        const ranks = playerRanks.get(roomId) || [];
        let recipient = targetId;
        const members = [...room.players];

        if (!recipient || !members.includes(recipient) || ranks.includes(recipient)) {
            const candidates = members.filter(id => id !== socket.id && !ranks.includes(id));
            if (!candidates.length) return;
            recipient = candidates[Math.floor(Math.random() * candidates.length)];
        }

        const emitData = { from: socket.id, lines };
        if (bots.has(recipient)) {
            bots.get(recipient).emit("ReceiveGarbage", emitData);
        } else {
            io.to(recipient).emit("ReceiveGarbage", emitData);
        }
        console.log(`💥 ${socket.id} sent ${lines} garbage to ${recipient} in ${roomId}`);
    });

    socket.on("requestRoomInfo", () => {
        const roomId = playerRoom.get(socket.id);
        if (roomId && rooms.has(roomId)) {
            const room = rooms.get(roomId);
            socket.join(roomId); // Re-join the room
            emitToRoom(io, room, "roomInfo", {
                roomId: room.roomId,
                members: [...room.players]
            });
        }
    });

    socket.on("disconnect", (reason) => {
        const roomId = playerRoom.get(socket.id);
        if (roomId && rooms.has(roomId)) {
            const room = rooms.get(roomId);
            if (room.isGameStarted) {
                handleGameOver(io, socket, reason);
            }
            room.players.delete(socket.id);
            room.initialPlayers.delete(socket.id);
            playerRoom.delete(socket.id);

            if (room.players.size === 0 && !room.isGameOver) {
                clearInterval(room.countdownInterval);
                spectators.delete(roomId);
                setTimeout(() => {
                    rooms.delete(roomId);
                    console.log(`🗑️ Room ${roomId} deleted due to being empty.`);
                }, 5000);
            }
        }
        for (const [rId, set] of spectators.entries()) {
            if (set.delete(socket.id) && set.size === 0) {
                spectators.delete(rId);
            }
        }
        if (bots.has(socket.id)) {
            bots.delete(socket.id);
        }
        console.log(`❌ ${socket.id} disconnected (${reason}).`);
    });
}

function initializeSocket(io) {
    io.on("connection", (socket) => {
        handleSocketConnection(io, socket);
    });
}

module.exports = { initializeSocket, handleSocketConnection };