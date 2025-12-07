const {
    rooms,
    playerRoom,
    playerRanks,
    spectators,
    socketConnections, // Import socket connections tracking map
    createRoom,
    createPrivateRoom, // New import
    getRoomByIdAndPassword, // New import
    getAvailableRoom,
    emitToSpectators,
    startCountdown,
    handleGameOver,
    emitToRoom,
    MAX_PLAYERS, // Import MAX_PLAYERS
    MIN_PLAYERS_TO_START, // Import MIN_PLAYERS_TO_START
    kickPlayer, // New import
    updatePlayerActivity, // Import function to update player activity
    trackSocketConnection, // Import function to track socket connections
    untrackSocketConnection, // Import function to untrack socket connections
    startSocketCleanupInterval, // Import function to start socket cleanup interval
    playerLastActive, // Import the player activity tracking map
    playerBoardLastUpdated // Import board update tracking map
} = require('./room.js');

// Rate limiting and validation data
const playerActivity = new Map(); // Track player stats for validation
const MAX_UPDATES_PER_SECOND = 60; // Max board updates per second
const MAX_GARBAGE_LINES_SINGLE_ATTACK = 10; // Max lines that can be sent in single attack
const { bots } = require('./bots.js');



function handleSocketConnection(io, socket) {
    console.log("🚀 User connected:", socket.id);
    socket.isSpectator = false; // NEW: Initialize spectator flag

    // Track the socket connection with timestamp
    trackSocketConnection(socket.id);

    socket.on('setTarget', (targetId) => {
        const roomId = playerRoom.get(socket.id);
        if (!roomId || !rooms.has(roomId)) return;
        const room = rooms.get(roomId);
        if (!room || room.isGameOver) return;

        // Update player activity
        updatePlayerActivity(socket.id);

        // Set the target for the current player
        room.playerTargets.set(socket.id, targetId);

        // Broadcast the change
        //console.log(`🎯 ${socket.id} is now targeting ${targetId}`);
    });

    socket.on("heartbeat", () => {
        updatePlayerActivity(socket.id);
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
                members: [...oldRoom.players],
                isPrivate: oldRoom.isPrivate,
                hostId: oldRoom.hostId
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
            // Explicitly create a public room
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
        // If player is already in a room, handle disconnect from old room logic first
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
            console.log(`🚪 ${socket.id} left room ${oldRoomId} to create a new one.`);

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
        console.log(`🔐 ${socket.id} created private room ${room.roomId}`);
    });

    socket.on("joinPrivateRoom", async ({ roomId, plainPassword }) => {
        // If player is already in a room, handle disconnect from old room logic first
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
            console.log(`🚪 ${socket.id} left room ${oldRoomId} to join ${roomId}.`);

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

        const { room, error } = await getRoomByIdAndPassword(roomId, plainPassword);
        if (error) {
            return socket.emit("uiMessage", { type: 'error', message: error }); // Use uiMessage
        }

        if (room.players.size >= MAX_PLAYERS) {
            return socket.emit("uiMessage", { type: 'error', message: "ルームが満員です。" }); // Use uiMessage
        }
        if (room.isGameStarted) {
            return socket.emit("uiMessage", { type: 'error', message: "ゲームが既に開始されています。" }); // Use uiMessage
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
        console.log(`🏠 ${socket.id} joined private room ${room.roomId}`);
    });

    socket.on("startGame", () => {
        const roomId = playerRoom.get(socket.id);
        if (!roomId || !rooms.has(roomId)) {
            return socket.emit("uiMessage", { type: 'error', message: "ルームに参加していません。" }); // Use uiMessage
        }
        const room = rooms.get(roomId);

        if (room.hostId !== socket.id) {
            return socket.emit("uiMessage", { type: 'error', message: "ルームのホストのみがゲームを開始できます。" }); // Use uiMessage
        }
        if (room.isGameStarted || room.isCountingDown) {
            return socket.emit("uiMessage", { type: 'error', message: "ゲームは既に開始されているか、カウントダウン中です。" }); // Use uiMessage
        }
        if (room.players.size < MIN_PLAYERS_TO_START) {
            return socket.emit("uiMessage", { type: 'error', message: `ゲーム開始には最低 ${MIN_PLAYERS_TO_START} 人のプレイヤーが必要です。` }); // Use uiMessage
        }

        // Force start countdown from Phase 2 (game start)
        clearInterval(room.countdownInterval); // Clear any existing countdown
        room.isCountingDown = false; // Reset to allow host to start
        room.countdownPhase = 2;
        room.countdownCount = 5; // Standard 5-second game start countdown
        startCountdown(io, room);
        socket.emit('uiMessage', { type: 'info', message: "ゲームを開始します！" });
        console.log(`🚀 ホスト ${socket.id} がルーム ${roomId} でゲームを開始しました。`);
    });

    socket.on('kickPlayer', ({ playerIdToKick }) => {
        const roomId = playerRoom.get(socket.id);
        if (!roomId || !rooms.has(roomId)) {
            return socket.emit("uiMessage", { type: 'error', message: "ルームに参加していません。" });
        }
        const room = rooms.get(roomId);

        if (room.hostId !== socket.id) {
            return socket.emit("uiMessage", { type: 'error', message: "ルームのホストのみがプレイヤーをキックできます。" });
        }
        if (playerIdToKick === socket.id) {
            return socket.emit("uiMessage", { type: 'error', message: "自分自身をキックすることはできません。" });
        }

        const success = kickPlayer(io, roomId, playerIdToKick);
        if (success) {
            socket.emit('uiMessage', { type: 'success', message: `${playerIdToKick} をルームからキックしました。` });
        } else {
            socket.emit('uiMessage', { type: 'error', message: `${playerIdToKick} をキックできませんでした。` });
        }
    });

    socket.on("spectateRoom", (roomId) => {
        if (!rooms.has(roomId)) {
            return socket.emit("uiMessage", { type: 'error', message: `指定されたルーム (${roomId}) は存在しません。` });
        }
        const room = rooms.get(roomId);
        // Allow spectating even if game has started
        if (room.players.size === 0 && room.isGameOver) { // Only allow spectating if game is over AND empty
             return socket.emit("uiMessage", { type: 'error', message: `指定されたルーム (${roomId}) は終了しています。` });
        }

        // If player is currently in a room (as a player or spectator), disconnect them first
        const oldRoomId = playerRoom.get(socket.id);
        if (oldRoomId && rooms.has(oldRoomId)) {
            const oldRoom = rooms.get(oldRoomId);
            // If they were a player, handle game over and remove from player lists
            if (oldRoom.players.has(socket.id)) {
                if (oldRoom.isGameStarted && !oldRoom.isGameOver) {
                    handleGameOver(io, socket, "converted to spectator", null);
                }
                oldRoom.players.delete(socket.id);
                oldRoom.initialPlayers.delete(socket.id);
                playerRoom.delete(socket.id);
                delete oldRoom.boards[socket.id];
            } else if (spectators.has(oldRoomId) && spectators.get(oldRoomId).has(socket.id)) {
                // If they were a spectator, just remove from spectator list
                spectators.get(oldRoomId).delete(socket.id);
                if (spectators.get(oldRoomId).size === 0) {
                    spectators.delete(oldRoomId);
                }
            }
            socket.leave(oldRoomId);
            console.log(`🔄 ${socket.id} left room ${oldRoomId} to spectate ${roomId}`);
        }

        // Add to new room as spectator
        if (!spectators.has(roomId)) spectators.set(roomId, new Set());
        spectators.get(roomId).add(socket.id);
        socket.join(roomId);
        socket.isSpectator = true; // Set spectator flag

        // Send room info and current board states to the new spectator
        socket.emit("spectateRoomInfo", {
            roomId: room.roomId,
            members: [...room.players], // Members are players, not spectators
            isGameStarted: room.isGameStarted,
            isPrivate: room.isPrivate,
            finalRanking: room.isGameOver ? Object.fromEntries(playerRanks.get(roomId).map((id, index) => [id, index + 1])) : null,
            finalStatsMap: room.isGameOver ? Object.fromEntries(room.stats) : null
        });
        socket.emit("BoardStatusBulk", room.boards);
        socket.emit('uiMessage', { type: 'info', message: `${roomId} を観戦しています。` });
        console.log(`👀 ${socket.id} is now spectating ${roomId}`);

        // Notify players in the room about the new spectator (optional)
        emitToRoom(io, room, "roomInfo", {
            roomId: room.roomId,
            members: [...room.players],
            isPrivate: room.isPrivate,
            hostId: room.hostId
        });
    });

    socket.on("BoardStatus", (board) => {
        const roomId = playerRoom.get(socket.id);
        if (!roomId || !rooms.has(roomId)) return;
        const room = rooms.get(roomId);
        if (!room || room.isGameOver) return;

        // Update player board activity timestamp
        playerBoardLastUpdated.set(socket.id, Date.now());

        // Update player activity
        updatePlayerActivity(socket.id);

        // Initialize player activity tracking
        if (!playerActivity.has(socket.id)) {
            playerActivity.set(socket.id, {
                lastUpdate: Date.now(),
                updateCount: 0,
                updateResetTime: Date.now()
            });
        }

        const activity = playerActivity.get(socket.id);
        const now = Date.now();

        // Rate limiting: reset counter every second
        if (now - activity.updateResetTime >= 1000) {
            activity.updateResetTime = now;
            activity.updateCount = 0;
        }

        // Check if player is sending too many updates
        activity.updateCount++;
        if (activity.updateCount > MAX_UPDATES_PER_SECOND) {
            console.warn(`⚠️ Player ${socket.id} exceeded board update rate limit in room ${roomId}`);
            // Optionally kick player for spamming updates
            kickPlayer(io, roomId, socket.id, "通信が異常な速度で送信されました。");
            return;
        }

        // Store the last update time for potential further checks
        activity.lastUpdate = now;

        // Cache the entire board state only when it's provided
        // This prevents overwriting the full board with just a diff
        if (board.board) {
            room.boards[socket.id] = board;
        }

        const payload = { UserID: socket.id, ...board };

        for (const playerId of room.players) {
            if (playerId === socket.id || bots.has(playerId)) continue;
            io.to(playerId).emit("BoardStatus", payload);
        }
        emitToSpectators(io, roomId, "BoardStatus", payload);
    });

    socket.on("gameOver", ({ stats }) => {
        handleGameOver(io, socket, "normal", stats);
    });

    socket.on("PlayerGameStatus", (status) => {
        if (status === 'gameover') {
            //console.log(`[Ranking] Received 'PlayerGameStatus: gameover' from ${socket.id}`);
            handleGameOver(io, socket, "bot game over", null);
        }
    });

    socket.on("SendGarbage", ({ targetId, lines }) => {
        const roomId = playerRoom.get(socket.id);
        if (!roomId || !rooms.has(roomId)) return;
        const room = rooms.get(roomId);
        if (!room || room.isGameOver || room.players.size <= 1) return;

        // Update player activity
        updatePlayerActivity(socket.id);

        // Validate that lines is a reasonable number to prevent cheating
        if (typeof lines !== 'number' || lines <= 0 || lines > MAX_GARBAGE_LINES_SINGLE_ATTACK) {
            console.warn(`⚠️ Player ${socket.id} sent invalid garbage amount (${lines}) in room ${roomId}`);
            kickPlayer(io, roomId, socket.id, "不正な攻撃データを送信しました。");
            return;
        }

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

        const emitData = { from: socket.id, lines, to: recipient };
        if (bots.has(recipient)) {
            bots.get(recipient).emit("ReceiveGarbage", emitData);
        } else {
            io.to(recipient).emit("ReceiveGarbage", emitData);
        }

        // Broadcast the transfer to the whole room for visual effects
        emitToRoom(io, room, "GarbageTransfer", { from: socket.id, to: recipient, lines });

        //console.log(`💥 ${socket.id} sent ${lines} garbage to ${recipient} in ${roomId}`);
    });

    socket.on("requestRoomInfo", () => {
        const roomId = playerRoom.get(socket.id);
        if (roomId && rooms.has(roomId)) {
            const room = rooms.get(roomId);
            socket.join(roomId); // Re-join the room
            emitToRoom(io, room, "roomInfo", {
                roomId: room.roomId,
                members: [...room.players],
                isPrivate: room.isPrivate,
                hostId: room.hostId
            });
        }
    });

    // NEW: requestPublicRooms handler
    socket.on("requestPublicRooms", () => {
        const publicRooms = [...rooms.values()]
            .filter(room => !room.isPrivate && room.players.size > 0 && room.isGameStarted && !room.isGameOver)
            .map(room => ({
                roomId: room.roomId,
                playersCount: room.players.size,
                isGameStarted: room.isGameStarted,
                isPrivate: room.isPrivate
            }));
        // Send public rooms list to the client via uiMessage
        socket.emit('uiMessage', { type: 'publicRoomsList', message: '公開ルームリスト', data: publicRooms });
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
            
            // IF PLAYER WAS A PLAYER
            if (room.players.has(socket.id)) {
                // THEN handle game over logic
                if (wasInGame) {
                    // Send a connection error message to the player who disconnected during game
                    io.to(socket.id).emit('uiMessage', {
                        type: 'error',
                        message: 'タイムアウトしました。ロビーに戻ります。'
                    });

                    // Send matching event to return to lobby after disconnect
                    io.to(socket.id).emit('matching');

                    handleGameOver(io, socket, reason, null);
                }

                // Now fully remove the player
                playerRoom.delete(socket.id);
                delete room.boards[socket.id]; // Clear board data when player disconnects
                room.players.delete(socket.id); // Remove from players Set
                room.initialPlayers.delete(socket.id); // Also remove from initial players
                socket.leave(roomId);
                console.log(`🚪 ${socket.id} left room ${roomId} on disconnect.`);

                if (targetsChanged) {
                     emitToRoom(io, room, 'targetsUpdate', Array.from(room.playerTargets.entries()));
                }

                // If the host (creator) of a private room leaves before the game starts, delete the room
                if (room.hostId === socket.id && room.isPrivate && !room.isGameStarted) {
                    // Clear any existing countdown
                    if (room.countdownInterval) {
                        clearInterval(room.countdownInterval);
                    }
                    // Notify all players in the room about the room closure
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
                    // Clean up spectators
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
                    // Remove room from all tracking maps
                    rooms.delete(roomId);
                    for (const [playerId, roomPlayerId] of playerRoom.entries()) {
                        if (roomPlayerId === roomId) {
                            playerRoom.delete(playerId);
                        }
                    }
                    if (playerRanks.has(roomId)) {
                        playerRanks.delete(roomId);
                    }
                    console.log(`🗑️ Private room ${roomId} deleted because host left before game started.`);
                } else if (room.players.size === 0 && !room.isGameOver) {
                    clearInterval(room.countdownInterval);
                    spectators.delete(roomId);
                    setTimeout(() => {
                        rooms.delete(roomId);
                        console.log(`🗑️ Room ${roomId} deleted due to being empty.`);
                    }, 5000);
                }
            }
        }
        
        // IF PLAYER WAS A SPECTATOR
        for (const [rId, set] of spectators.entries()) {
            if (set.delete(socket.id) && set.size === 0) {
                spectators.delete(rId);
            }
        }
        // Clean up player activity tracking
        playerActivity.delete(socket.id);
        playerLastActive.delete(socket.id);
        playerBoardLastUpdated.delete(socket.id);
        // Untrack socket connection
        untrackSocketConnection(socket.id);
        if (bots.has(socket.id)) {
            bots.delete(socket.id);
        }
        console.log(`❌ ${socket.id} disconnected (${reason}).`);
    });
}

function initializeSocket(io) {
    // Start the 30-minute socket cleanup interval
    startSocketCleanupInterval();

    io.on("connection", (socket) => {
        handleSocketConnection(io, socket);
    });
}

module.exports = { initializeSocket, handleSocketConnection };