const {
    rooms,
    playerRoom,
    spectators,
    playerLastActive,
    playerBoardLastUpdated,
    socketConnections,
    updatePlayerActivity,
    handleGameOver,
    emitToRoom,
    untrackSocketConnection,
    trackSocketConnection
} = require('../room.js');
const { bots } = require('../bots.js');

function registerConnectionHandlers(io, socket) {
    socket.on("heartbeat", () => {
        updatePlayerActivity(socket.id);
        // Also update board update timestamp on heartbeat to prevent in-game timeout
        // as long as the connection is alive
        playerBoardLastUpdated.set(socket.id, Date.now());
    });

    socket.on("disconnect", (reason) => {
        const roomId = playerRoom.get(socket.id);
        if (roomId && rooms.has(roomId)) {
            const room = rooms.get(roomId);
            const wasInGame = room.isGameStarted && !room.isGameOver;

            if (room.playerTargets.has(socket.id)) {
                room.playerTargets.delete(socket.id);
            }
            for (const [attackerId, targetedId] of room.playerTargets.entries()) {
                if (targetedId === socket.id) {
                    room.playerTargets.set(attackerId, null);
                }
            }
            
            if (room.players.has(socket.id)) {
                if (wasInGame) {
                    io.to(socket.id).emit('uiMessage', {
                        type: 'error',
                        message: 'タイムアウトしました。ロビーに戻ります。'
                    });
                    io.to(socket.id).emit('matching');
                    handleGameOver(io, socket, reason, null);
                }

                playerRoom.delete(socket.id);
                delete room.boards[socket.id];
                room.players.delete(socket.id);
                // Only remove from initialPlayers if the game hasn't started yet
                // Once started, we need to keep the initial count for ranking calculations
                if (!room.isGameStarted) {
                    room.initialPlayers.delete(socket.id);
                }
                socket.leave(roomId);

                // Notify remaining players about the updated member list and targets
                emitToRoom(io, room, "roomInfo", {
                    roomId: room.roomId,
                    members: [...room.players],
                    isPrivate: room.isPrivate,
                    hostId: room.hostId
                });
                emitToRoom(io, room, 'targetsUpdate', Array.from(room.playerTargets.entries()));

                if (room.hostId === socket.id && room.isPrivate) {
                    if (room.countdownInterval) clearInterval(room.countdownInterval);
                    for (const playerId of room.players) {
                        if (bots.has(playerId)) {
                            bots.get(playerId).emit('roomClosed');
                        } else {
                            const playerSocket = io.sockets.sockets.get(playerId);
                            if (playerSocket) {
                                playerSocket.emit('roomClosed');
                                playerSocket.leave(roomId);
                            }
                        }
                    }
                    if (spectators.has(roomId)) {
                        for (const specId of spectators.get(roomId)) {
                            const specSocket = io.sockets.sockets.get(specId);
                            if (specSocket) {
                                specSocket.emit('roomClosed');
                                specSocket.leave(roomId);
                            }
                        }
                        spectators.delete(roomId);
                    }
                    rooms.delete(roomId);
                } else if (room.players.size === 0 && !room.isGameOver) {
                    clearInterval(room.countdownInterval);
                    spectators.delete(roomId);
                    setTimeout(() => {
                        rooms.delete(roomId);
                    }, 5000);
                }
            }
        }
        
        for (const [rId, set] of spectators.entries()) {
            if (set.delete(socket.id) && set.size === 0) {
                spectators.delete(rId);
            }
        }
        playerLastActive.delete(socket.id);
        playerBoardLastUpdated.delete(socket.id);
        untrackSocketConnection(socket.id);
        if (bots.has(socket.id)) {
            bots.delete(socket.id);
        }
        console.log(`❌ ${socket.id} disconnected (${reason}).`);
    });
}

module.exports = registerConnectionHandlers;
