const {
    rooms,
    playerRoom,
    createRoom,
    createPrivateRoom,
    getRoomByIdAndPassword,
    getAvailableRoom,
    startCountdown,
    handleGameOver,
    emitToRoom,
    MAX_PLAYERS,
    MIN_PLAYERS_TO_START,
    kickPlayer,
    spectators,
    playerRanks
} = require('../room.js');
const { bots } = require('../bots.js');

function registerRoomHandlers(io, socket) {
    socket.on("matching", () => {
        const oldRoomId = playerRoom.get(socket.id);
        if (oldRoomId && rooms.has(oldRoomId)) {
            const oldRoom = rooms.get(oldRoomId);
            if (oldRoom.isGameStarted && !oldRoom.isGameOver) {
                handleGameOver(io, socket, "left to re-match");
            }
            
            oldRoom.players.delete(socket.id);
            oldRoom.initialPlayers.delete(socket.id);
            playerRoom.delete(socket.id);
            delete oldRoom.boards[socket.id];

            socket.leave(oldRoomId);
            console.log(`🚪 ${socket.id} left room ${oldRoomId}`);

            emitToRoom(io, oldRoom, "roomInfo", {
                roomId: oldRoom.roomId,
                members: [...oldRoom.players],
                isPrivate: oldRoom.isPrivate,
                hostId: oldRoom.hostId
            });

            if (oldRoom.players.size === 0 && !oldRoom.isGameOver) {
                clearInterval(oldRoom.countdownInterval);
                spectators.delete(oldRoomId);
                setTimeout(() => {
                    rooms.delete(oldRoomId);
                    console.log(`🗑️ Room ${oldRoomId} deleted due to being empty.`);
                }, 5000);
            }
        }

        let room = getAvailableRoom();
        if (room) {
            room.players.add(socket.id);
            room.initialPlayers.add(socket.id);
            console.log(`🏠 ${socket.id} joined ${room.roomId}`);
        } else {
            room = createRoom(socket.id, false, null, socket.id); 
            console.log(`🏠 ${socket.id} created new public room ${room.roomId}`);
        }
        playerRoom.set(socket.id, room.roomId);
        socket.join(room.roomId);

        emitToRoom(io, room, "roomInfo", {
            roomId: room.roomId,
            members: [...room.players],
            isPrivate: room.isPrivate,
            hostId: room.hostId
        });

        if (!room.isGameStarted && !room.isCountingDown) {
            startCountdown(io, room);
        }
    });

    socket.on("createPrivateRoom", async ({ plainPassword }) => {
        const oldRoomId = playerRoom.get(socket.id);
        if (oldRoomId && rooms.has(oldRoomId)) {
            const oldRoom = rooms.get(oldRoomId);
            if (oldRoom.isGameStarted && !oldRoom.isGameOver) {
                handleGameOver(io, socket, "left to create new room");
            }
            oldRoom.players.delete(socket.id);
            oldRoom.initialPlayers.delete(socket.id);
            playerRoom.delete(socket.id);
            delete oldRoom.boards[socket.id];
            socket.leave(oldRoomId);

            emitToRoom(io, oldRoom, "roomInfo", {
                roomId: oldRoom.roomId,
                members: [...oldRoom.players],
                isPrivate: oldRoom.isPrivate,
                hostId: oldRoom.hostId
            });

            if (oldRoom.players.size === 0 && !oldRoom.isGameOver) {
                clearInterval(oldRoom.countdownInterval);
                spectators.delete(oldRoomId);
                setTimeout(() => {
                    rooms.delete(oldRoomId);
                }, 5000);
            }
        }
        
        const room = await createPrivateRoom(socket.id, plainPassword);
        playerRoom.set(socket.id, room.roomId);
        socket.join(room.roomId);

        emitToRoom(io, room, "roomInfo", {
            roomId: room.roomId,
            members: [...room.players],
            isPrivate: room.isPrivate,
            hostId: room.hostId
        });
        socket.emit("roomCreated", { roomId: room.roomId });
        socket.emit('uiMessage', { type: 'success', message: `部屋を作成しました！ ルームID: ${room.roomId}` });
    });

    socket.on("joinPrivateRoom", async ({ roomId, plainPassword }) => {
        const oldRoomId = playerRoom.get(socket.id);
        if (oldRoomId && rooms.has(oldRoomId)) {
            const oldRoom = rooms.get(oldRoomId);
            if (oldRoom.isGameStarted && !oldRoom.isGameOver) {
                handleGameOver(io, socket, "left to join another room");
            }
            oldRoom.players.delete(socket.id);
            oldRoom.initialPlayers.delete(socket.id);
            playerRoom.delete(socket.id);
            delete oldRoom.boards[socket.id];
            socket.leave(oldRoomId);

            emitToRoom(io, oldRoom, "roomInfo", {
                roomId: oldRoom.roomId,
                members: [...oldRoom.players],
                isPrivate: oldRoom.isPrivate,
                hostId: oldRoom.hostId
            });

            if (oldRoom.players.size === 0 && !oldRoom.isGameOver) {
                clearInterval(oldRoom.countdownInterval);
                spectators.delete(oldRoomId);
                setTimeout(() => {
                    rooms.delete(oldRoomId);
                }, 5000);
            }
        }

        const { room, error } = await getRoomByIdAndPassword(roomId, plainPassword);
        if (error) {
            return socket.emit("uiMessage", { type: 'error', message: error });
        }

        if (room.players.size >= MAX_PLAYERS) {
            return socket.emit("uiMessage", { type: 'error', message: "ルームが満員です。" });
        }
        if (room.isGameStarted) {
            return socket.emit("uiMessage", { type: 'error', message: "ゲームが既に開始されています。" });
        }
        
        room.players.add(socket.id);
        room.initialPlayers.add(socket.id);
        playerRoom.set(socket.id, room.roomId);
        socket.join(room.roomId);

        emitToRoom(io, room, "roomInfo", {
            roomId: room.roomId,
            members: [...room.players],
            isPrivate: room.isPrivate,
            hostId: room.hostId
        });
        socket.emit('uiMessage', { type: 'success', message: `プライベートルーム ${room.roomId} に参加しました。` });
    });

    socket.on("startGame", () => {
        const roomId = playerRoom.get(socket.id);
        if (!roomId || !rooms.has(roomId)) {
            return socket.emit("uiMessage", { type: 'error', message: "ルームに参加していません。" });
        }
        const room = rooms.get(roomId);

        if (room.hostId !== socket.id) {
            return socket.emit("uiMessage", { type: 'error', message: "ルームのホストのみがゲームを開始できます。" });
        }
        if (room.isGameStarted || room.isCountingDown) {
            return socket.emit("uiMessage", { type: 'error', message: "ゲームは既に開始されているか、カウントダウン中です。" });
        }
        if (room.players.size < MIN_PLAYERS_TO_START) {
            return socket.emit("uiMessage", { type: 'error', message: `ゲーム開始には最低 ${MIN_PLAYERS_TO_START} 人のプレイヤーが必要です。` });
        }

        clearInterval(room.countdownInterval);
        room.isCountingDown = false;
        room.countdownPhase = 2;
        room.countdownCount = 5;
        startCountdown(io, room);
        socket.emit('uiMessage', { type: 'info', message: "ゲームを開始します！" });
    });

    socket.on('kickPlayer', ({ playerIdToKick }) => {
        const roomId = playerRoom.get(socket.id);
        if (!roomId || !rooms.has(roomId)) return;
        const room = rooms.get(roomId);
        if (room.hostId !== socket.id) return;
        kickPlayer(io, roomId, playerIdToKick);
    });

    socket.on("requestRoomInfo", () => {
        const roomId = playerRoom.get(socket.id);
        if (roomId && rooms.has(roomId)) {
            const room = rooms.get(roomId);
            socket.join(roomId);
            emitToRoom(io, room, "roomInfo", {
                roomId: room.roomId,
                members: [...room.players],
                isPrivate: room.isPrivate,
                hostId: room.hostId
            });
        }
    });

    socket.on("requestPublicRooms", () => {
        const publicRooms = [...rooms.values()]
            .filter(room => !room.isPrivate && room.players.size > 0 && room.isGameStarted && !room.isGameOver)
            .map(room => ({
                roomId: room.roomId,
                playersCount: room.players.size,
                isGameStarted: room.isGameStarted,
                isPrivate: room.isPrivate
            }));
        socket.emit('uiMessage', { type: 'publicRoomsList', message: '公開ルームリスト', data: publicRooms });
    });
}

module.exports = registerRoomHandlers;
