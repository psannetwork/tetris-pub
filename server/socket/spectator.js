const {
    rooms,
    playerRoom,
    playerRanks,
    spectators,
    handleGameOver,
    emitToRoom
} = require('../room.js');

function registerSpectatorHandlers(io, socket) {
    socket.on("spectateRoom", (roomId) => {
        if (!rooms.has(roomId)) {
            return socket.emit("uiMessage", { type: 'error', message: `指定されたルーム (${roomId}) は存在しません。` });
        }
        const room = rooms.get(roomId);

        const oldRoomId = playerRoom.get(socket.id);
        if (oldRoomId && rooms.has(oldRoomId)) {
            const oldRoom = rooms.get(oldRoomId);
            if (oldRoom.players.has(socket.id)) {
                if (oldRoom.isGameStarted && !oldRoom.isGameOver) {
                    handleGameOver(io, socket, "converted to spectator", null);
                }
                oldRoom.players.delete(socket.id);
                oldRoom.initialPlayers.delete(socket.id);
                playerRoom.delete(socket.id);
                delete oldRoom.boards[socket.id];
            } else if (spectators.has(oldRoomId) && spectators.get(oldRoomId).has(socket.id)) {
                spectators.get(oldRoomId).delete(socket.id);
                if (spectators.get(oldRoomId).size === 0) {
                    spectators.delete(oldRoomId);
                }
            }
            socket.leave(oldRoomId);
        }

        if (!spectators.has(roomId)) spectators.set(roomId, new Set());
        spectators.get(roomId).add(socket.id);
        socket.join(roomId);
        socket.isSpectator = true;

        socket.emit("spectateRoomInfo", {
            roomId: room.roomId,
            members: [...room.players],
            isGameStarted: room.isGameStarted,
            isPrivate: room.isPrivate,
            finalRanking: room.isGameOver ? Object.fromEntries(playerRanks.get(roomId).map((id, index) => [id, index + 1])) : null,
            finalStatsMap: room.isGameOver ? Object.fromEntries(room.stats) : null
        });
        socket.emit("BoardStatusBulk", room.boards);
        socket.emit('uiMessage', { type: 'info', message: `${roomId} を観戦しています。` });

        emitToRoom(io, room, "roomInfo", {
            roomId: room.roomId,
            members: [...room.players],
            isPrivate: room.isPrivate,
            hostId: room.hostId
        });

        // Notify all players in the room that a new spectator has joined
        // This triggers players to send a full board update
        emitToRoom(io, room, "NewSpectator");
    });
}

module.exports = registerSpectatorHandlers;
