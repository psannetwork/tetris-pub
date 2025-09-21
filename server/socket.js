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

    socket.on('setTarget', (targetId) => {
        const roomId = playerRoom.get(socket.id);
        if (!roomId || !rooms.has(roomId)) return;
        const room = rooms.get(roomId);
        if (!room || room.isGameOver) return;

        // Set the target for the current player
        room.playerTargets.set(socket.id, targetId);

        // Broadcast the change
        emitToRoom(io, room, 'targetsUpdate', Array.from(room.playerTargets.entries()));
        console.log(`🎯 ${socket.id} is now targeting ${targetId}`);
    });

    socket.on("matching", () => {
        const oldRoomId = playerRoom.get(socket.id);
        if (oldRoomId && rooms.has(oldRoomId)) {
            const oldRoom = rooms.get(oldRoomId);
            // If the player was in a game that had started BUT was not yet over, handle it as a game over.
        // If the game was already over, no need to call handleGameOver again.
        if (oldRoom.isGameStarted && !oldRoom.isGameOver) {
            handleGameOver(io, socket, "left to re-match");
        }
            
            // Now, fully remove the player from the old room
        oldRoom.players.delete(socket.id);
        oldRoom.initialPlayers.delete(socket.id);
        playerRoom.delete(socket.id); // Also clear the playerRoom map here
        delete oldRoom.boards[socket.id]; // Clear board data when player leaves room

        socket.leave(oldRoomId); // Leave the socket.io room
        console.log(`🚪 ${socket.id} left room ${oldRoomId}`);

        // Notify remaining players in the old room
            emitToRoom(io, oldRoom, "roomInfo", {
                roomId: oldRoom.roomId,
                members: [...oldRoom.players]
            });

            // If the room becomes empty, clean it up
            if (oldRoom.players.size === 0 && !oldRoom.isGameOver) {
                clearInterval(oldRoom.countdownInterval);
                spectators.delete(oldRoomId);
                setTimeout(() => {
                    rooms.delete(oldRoomId);
                    console.log(`🗑️ Room ${oldRoomId} deleted due to being empty after a player left.`);
                }, 5000);
            }
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
                const wasInGame = prevRoom.isGameStarted && !prevRoom.isGameOver;
                // Delete player from active players list
                prevRoom.players.delete(socket.id);
                playerRoom.delete(socket.id);
                socket.leave(prevRoomId);
                console.log(`🔄 ${socket.id} converted from player to spectator for ${roomId}`);
                // Handle game over for the previous room
                if (wasInGame) {
                    handleGameOver(io, socket, "spectating", null);
                }
            }
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

    socket.on("gameOver", ({ stats }) => {
        handleGameOver(io, socket, "normal", stats);
    });

    socket.on("SendGarbage", ({ targetId, lines }) => {
        const roomId = playerRoom.get(socket.id);
        if (!roomId || !rooms.has(roomId)) return;
        const room = rooms.get(roomId);
        if (!room || room.isGameOver || room.players.size <= 1) return;

        const ranks = playerRanks.get(roomId) || [];
        // Prioritize explicit targetId, then stored target, then random
        let recipient = targetId || room.playerTargets.get(socket.id);
        const members = [...room.players];

        if (!recipient || !members.includes(recipient) || ranks.includes(recipient)) {
            const candidates = members.filter(id => id !== socket.id && !ranks.includes(id));
            if (!candidates.length) return;
            recipient = candidates[Math.floor(Math.random() * candidates.length)];
            // Update target to the new random recipient and notify clients
            room.playerTargets.set(socket.id, recipient);
            emitToRoom(io, room, 'targetsUpdate', Array.from(room.playerTargets.entries()));
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
            const wasInGame = room.isGameStarted && !room.isGameOver;

            // --- Target Cleanup ---
            let targetsChanged = false;
            if (room.playerTargets.has(socket.id)) {
                room.playerTargets.delete(socket.id);
                targetsChanged = true;
            }
            for (const [attackerId, targetedId] of room.playerTargets.entries()) {
                if (targetedId === socket.id) {
                    room.playerTargets.set(attackerId, null); // Set target to null
                    targetsChanged = true;
                }
            }

            // Remove player from room FIRST
            room.players.delete(socket.id);
            playerRoom.delete(socket.id);
            delete room.boards[socket.id]; // Clear board data when player disconnects
            socket.leave(roomId);
            console.log(`🚪 ${socket.id} left room ${roomId} on disconnect.`);

            // THEN handle game over logic
            if (wasInGame) {
                handleGameOver(io, socket, reason, null);
            }

            if (targetsChanged) {
                 emitToRoom(io, room, 'targetsUpdate', Array.from(room.playerTargets.entries()));
            }
            
            // Note: We don't delete from initialPlayers so ranking works correctly.
            // The room cleanup logic will handle it later.

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