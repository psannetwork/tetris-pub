const MAX_PLAYERS = 99;
const MIN_PLAYERS_TO_START = 2;
const COUNTDOWN_START = 10;

const rooms = new Map();
const playerRoom = new Map();
const playerRanks = new Map();
const spectators = new Map();
// let roomCounter = 0; // Removed roomCounter as IDs will be random

const { bots } = require('./bots.js');
const bcrypt = require('bcrypt');

// Helper to generate unique short alphanumeric IDs
function generateUniqueRoomId() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    let isUnique = false;
    while (!isUnique) {
        result = '';
        for (let i = 0; i < 6; i++) {
            result += characters.charAt(Math.floor(Math.random() * characters.length));
        }
        // Check if generated ID is unique
        if (!rooms.has(result)) {
            isUnique = true;
        }
    }
    return result;
}

function createRoom(playerId, isPrivate = false, password = null, hostId = null) {
    const roomId = generateUniqueRoomId(); // Generate unique ID
    const room = {
        roomId,
        players: new Set([playerId]),
        initialPlayers: new Set([playerId]),
        playerTargets: new Map(), // Who is targeting whom
        isCountingDown: false,
        isGameStarted: false,
        isGameOver: false,
        totalPlayers: null,
        boards: {},
        stats: new Map(),
        countdownCount: COUNTDOWN_START,
        countdownInterval: null,
        matchingClosed: false,
        countdownPhase: 1, // 1: matching countdown, 2: game start countdown
        isPrivate: isPrivate, // New: Is this a private room?
        password: password, // New: Hashed password for private rooms
        hostId: hostId || playerId // New: Host of the room
    };
    rooms.set(roomId, room);
    return room;
}

async function createPrivateRoom(playerId, plainPassword) {
    let hashedPassword = null;
    if (plainPassword) {
        hashedPassword = await bcrypt.hash(plainPassword, 10);
    }
    return createRoom(playerId, true, hashedPassword, playerId);
}

async function getRoomByIdAndPassword(roomId, plainPassword) {
    const room = rooms.get(roomId);
    if (!room || !room.isPrivate) {
        return { error: "指定されたプライベートルームは存在しません。" };
    }
    if (!room.password) { // No password set for private room
        if (!plainPassword) return { room: room };
        return { error: "パスワードが設定されていません。" };
    }

    const match = await bcrypt.compare(plainPassword, room.password);
    if (match) {
        return { room: room };
    } else {
        return { error: "パスワードが間違っています。" };
    }
}

function getAvailableRoom() {
    for (const room of rooms.values()) {
        if (!room.isGameStarted && !room.isGameOver && room.players.size < MAX_PLAYERS && !room.matchingClosed && !room.isPrivate) {
            return room;
        }
    }
    return null;
}

function emitToSpectators(io, roomId, event, data) {
    if (spectators.has(roomId)) {
        for (const specId of spectators.get(roomId)) {
            io.to(specId).emit(event, data);
        }
    }
}

// Unified function to emit to all players in a room (bots and real)
function emitToRoom(io, room, event, data) { // `io` parameter added
    // Create a temporary set of players to avoid issues if the set is modified during iteration
    const playersToEmit = new Set(room.players);
    for (const playerId of playersToEmit) {
        if (bots.has(playerId)) {
            bots.get(playerId).emit(event, data);
        } else {
            io.to(playerId).emit(event, data);
        }
    }
    emitToSpectators(io, room.roomId, event, data);
}

function startCountdown(io, room) {
    if (!room || room.isCountingDown || room.isGameStarted) return;
    room.isCountingDown = true;
    room.countdownPhase = 1; // Ensure it starts at phase 1
    room.countdownCount = COUNTDOWN_START; // 10 seconds for matching

    console.log(`⏳ Room ${room.roomId} countdown started (Phase 1: Matching).`);
    room.countdownInterval = setInterval(() => {
        if (!rooms.has(room.roomId)) {
            clearInterval(room.countdownInterval);
            return;
        }

        if (room.countdownPhase === 1) {
            // Phase 1: Matching Countdown
            // For private rooms, if only one player, don't reset countdown
            if (!room.isPrivate && room.players.size < MIN_PLAYERS_TO_START) {
                if (room.players.size >= 1 && room.countdownCount !== COUNTDOWN_START) {
                    room.countdownCount = COUNTDOWN_START;
                    console.log(`🔄 Room ${room.roomId} countdown reset (Phase 1).`);
                }
                const msg = "プレイヤーを待機中です...";
                emitToRoom(io, room, "CountDown", msg);
                return;
            } else if (room.isPrivate && room.players.size < MIN_PLAYERS_TO_START && room.hostId === room.players.keys().next().value) {
                // If it's a private room and only the host is present, keep waiting
                const msg = "他のプレイヤーを待機中です...";
                emitToRoom(io, room, "CountDown", msg);
                return;
            }


            emitToRoom(io, room, "CountDown", room.countdownCount);
            console.log(`⏳ Room ${room.roomId} countdown (Phase 1): ${room.countdownCount}`);
            room.countdownCount--;

            if (room.countdownCount < 0 || room.players.size >= MAX_PLAYERS) {
                // Transition to Phase 2
                room.matchingClosed = true;
                room.countdownPhase = 2;
                room.countdownCount = 5; // 5 seconds for game start
                console.log(`✅ Room ${room.roomId} matching closed. Starting game countdown (Phase 2).`);
                emitToRoom(io, room, "CountDown", "マッチング締め切り！"); // Notify clients
            }
        } else if (room.countdownPhase === 2) {
            // Phase 2: Game Start Countdown
            emitToRoom(io, room, "CountDown", room.countdownCount);
            console.log(`⏳ Room ${room.roomId} countdown (Phase 2): ${room.countdownCount}`);
            room.countdownCount--;

            if (room.countdownCount < 0) {
                clearInterval(room.countdownInterval);
                room.isCountingDown = false;
                room.isGameStarted = true;
                room.totalPlayers = room.initialPlayers.size;
                emitToRoom(io, room, "StartGame");
                console.log(`🎮 Room ${room.roomId} game started (totalPlayers: ${room.totalPlayers}).`);
            }
        }
    }, 1000);
}

function handleGameOver(io, socket, reason, stats) {
    const roomId = playerRoom.get(socket.id);
    if (!roomId || !rooms.has(roomId)) return;
    const room = rooms.get(roomId);

    console.log(`[Ranking] handleGameOver called for ${socket.id} in room ${roomId}. Reason: ${reason}`);

    if (room.isGameOver) {
        console.log(`[Ranking] Room ${roomId} is already game over. Ignoring.`);
        return;
    }

    // Store player stats
    if (stats) {
        room.stats.set(socket.id, stats);
    }

    if (!playerRanks.has(roomId)) playerRanks.set(roomId, []);
    const ranks = playerRanks.get(roomId);
    if (!ranks.includes(socket.id)) {
        ranks.push(socket.id);
        console.log(`[Ranking] ${socket.id} added to ranks for room ${roomId}. Ranks: [${ranks.join(', ')}]`);
    }

    // Ensure the player is removed from active players map for targeting purposes
    playerRoom.delete(socket.id);

    const activePlayersCount = room.initialPlayers.size - ranks.length;
    console.log(`[Ranking] Active players left in ${roomId}: ${activePlayersCount}`);

    // Construct the current ranking order
    const stillPlaying = [...room.initialPlayers].filter(id => !ranks.includes(id));
    const finalRanks = [...stillPlaying, ...ranks.slice().reverse()];
    
    const yourRankMap = Object.fromEntries(
        [...room.initialPlayers].map(id => {
            const rank = finalRanks.indexOf(id) + 1;
            // If player is still playing, their rank is provisional (e.g., "1-3")
            // If they are eliminated, they have a fixed rank.
            return [id, rank > 0 ? rank : null];
        })
    );
    
    // For players still playing, instead of a number, we can show a range.
    // Let's adjust the rank map for this.
    const eliminatedCount = ranks.length;
    [...room.initialPlayers].forEach(id => {
        if(stillPlaying.includes(id)) {
            // Still playing, rank is 1
            yourRankMap[id] = 1;
        } else {
            // Eliminated, rank is total players - their position in reversed ranks list
            yourRankMap[id] = stillPlaying.length + ranks.slice().reverse().indexOf(id) + 1;
        }
    });

    console.log(`[Ranking] Emitting ranks for room ${roomId}. Rank Map:`, yourRankMap);
    
    const statsMap = Object.fromEntries(room.stats);
    const rankingData = { ranking: finalRanks, yourRankMap, statsMap, roomId: room.roomId };
    emitToRoom(io, room, "ranking", rankingData);

    // If the game is now over, handle final win/loss emits
    if (activePlayersCount <= 1) {
        room.isGameOver = true;
        console.log(`[Ranking] Game over in room ${roomId}.`);

        const winnerId = finalRanks[0];

        if (winnerId) { // Check if winnerId exists
            if (bots.has(winnerId)) {
                bots.get(winnerId).emit("YouWin");
            } else {
                io.to(winnerId).emit("YouWin");
            }
        }

        for (const playerId of room.initialPlayers) {
            if (playerId !== winnerId) {
                if (bots.has(playerId)) {
                    bots.get(playerId).emit("GameOver");
                } else {
                    io.to(playerId).emit("GameOver");
                }
            }
        }
        emitToSpectators(io, room.roomId, "GameOver");
    }
}

function kickPlayer(io, roomId, playerIdToKick, reason = "ルームホストによってキックされました。") {
    const room = rooms.get(roomId);
    if (!room) return false;

    // Check if the player to kick is in the room
    if (!room.players.has(playerIdToKick)) return false;

    // Remove player from room sets
    room.players.delete(playerIdToKick);
    room.initialPlayers.delete(playerIdToKick); // Also remove from initial players
    playerRoom.delete(playerIdToKick);
    delete room.boards[playerIdToKick];

    // Find the socket of the kicked player and disconnect them from the room
    const kickedSocket = io.sockets.sockets.get(playerIdToKick);
    if (kickedSocket) {
        kickedSocket.leave(roomId);
        kickedSocket.emit('kicked', { roomId, reason }); // Notify kicked player
        console.log(`🚪 Player ${playerIdToKick} was kicked from room ${roomId}.`);
    } else if (bots.has(playerIdToKick)) {
        // Handle kicked bot
        bots.get(playerIdToKick).emit('kicked', { roomId, reason });
        bots.delete(playerIdToKick);
        console.log(`🤖 Bot ${playerIdToKick} was kicked from room ${roomId}.`);
    }

    // Notify remaining players in the room
    emitToRoom(io, room, "roomInfo", {
        roomId: room.roomId,
        members: [...room.players],
        isPrivate: room.isPrivate,
        hostId: room.hostId
    });

    // If the room becomes empty and game is not over, clean it up
    if (room.players.size === 0 && !room.isGameOver) {
        clearInterval(room.countdownInterval);
        spectators.delete(roomId);
        setTimeout(() => {
            rooms.delete(roomId);
            console.log(`🗑️ Room ${roomId} deleted due to being empty after a player was kicked.`);
        }, 5000);
    }
    return true;
}

module.exports = {
    MAX_PLAYERS, // Export MAX_PLAYERS
    MIN_PLAYERS_TO_START, // Export MIN_PLAYERS_TO_START
    rooms,
    playerRoom,
    playerRanks,
    spectators,
    createRoom,
    createPrivateRoom, // New export
    getRoomByIdAndPassword, // New export
    getAvailableRoom,
    emitToSpectators,
    startCountdown,
    handleGameOver,
    emitToRoom,
    kickPlayer // New export
};