const MAX_PLAYERS = 99;
const MIN_PLAYERS_TO_START = 2;
const COUNTDOWN_START = 10;

const rooms = new Map();
const playerRoom = new Map();
const playerRanks = new Map();
const spectators = new Map();
const playerLastActive = new Map(); // Track last activity time for each player
const playerBoardLastUpdated = new Map(); // Track last board update time
const socketConnections = new Map(); // Track socket connections with timestamps
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

// Global io reference to be set by the main server file
let ioRef = null;

// Timeout duration in milliseconds
const PLAYER_TIMEOUT_MS = 40000; // 40 seconds
const BOARD_UPDATE_TIMEOUT_MS = 10000; // 10 seconds

function setIoReference(io) {
    ioRef = io;
}

// Function to update player activity timestamp
function updatePlayerActivity(playerId) {
    playerLastActive.set(playerId, Date.now());
}

// Function to check for inactive players and handle timeouts
function checkPlayerTimeouts(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;

    const now = Date.now();
    for (const playerId of room.players) {
        // Skip bots
        if (bots.has(playerId)) continue;

        if (room.isGameStarted && !room.isGameOver) {
            // --- In-Game Timeout Logic (Board Updates) ---
            const lastBoardUpdate = playerBoardLastUpdated.get(playerId);

            if (lastBoardUpdate && (now - lastBoardUpdate > BOARD_UPDATE_TIMEOUT_MS)) {
                console.log(`⏰ Player ${playerId} timed out in room ${roomId} (no board update for 15s)`);
                handlePlayerTimeout(ioRef, playerId, roomId);
            }
        } else {
            // --- Lobby Timeout Logic (General Activity) ---
            const lastActive = playerLastActive.get(playerId);
            if (lastActive && (now - lastActive > PLAYER_TIMEOUT_MS)) {
                console.log(`⏰ Player ${playerId} timed out in lobby of room ${roomId} (no activity for 40s)`);
                kickPlayer(ioRef, roomId, playerId, "活動がないため部屋から退出させられました。");
            }
        }
    }
}

// Function to handle a player timeout
function handlePlayerTimeout(io, playerId, roomId) {
    const room = rooms.get(roomId);
    if (!room) return;

    // If the player is still in the room, process the timeout
    if (room.players.has(playerId)) {
        // Make sure the playerRoom mapping exists before handling timeout
        if (!playerRoom.has(playerId)) {
            playerRoom.set(playerId, roomId);
        }

        // Create a temporary socket object to pass to handleGameOver
        const tempSocket = {
            id: playerId,
        };

        // Use ioRef if io is null (e.g. in timeout scenarios)
        const effectiveIo = io || ioRef;

        // Send a connection error message to the player before handling game over
        if (effectiveIo && !bots.has(playerId)) {
            effectiveIo.to(playerId).emit('uiMessage', {
                type: 'timeout',
                message: 'タイムアウトしました。ロビーに戻ります。'
            });

            // Send matching event to return to lobby after timeout
            effectiveIo.to(playerId).emit('matching');
        }

        // Handle as if the player lost connection and was eliminated
        handleGameOver(effectiveIo, tempSocket, "connection timeout", null);
    }
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
        hostId: hostId || playerId, // New: Host of the room
        creationTime: Date.now(), // New: Track room creation time for timeout
        timeoutId: null, // New: Track timeout ID for cleanup
        activityCheckInterval: null // Track activity check interval
    };

    // Set up periodic activity checking for this room
    room.activityCheckInterval = setInterval(() => {
        checkPlayerTimeouts(roomId);
    }, 2000); // Check every 2 seconds

    // Set timeout to clean up the room after a specified time
    const timeoutDuration = isPrivate ? 2 * 60 * 60 * 1000 : 30 * 60 * 1000; // 2 hours for private, 30 mins for public
    room.timeoutId = setTimeout(() => {
        const roomToClean = rooms.get(roomId);
        if (roomToClean) {
            console.log(`⏱️ Room ${roomId} has timed out and will be cleaned up.`);

            // Clean up activity check interval
            if (roomToClean.activityCheckInterval) {
                clearInterval(roomToClean.activityCheckInterval);
            }

            // Clean up countdown interval if it exists
            if (roomToClean.countdownInterval) {
                clearInterval(roomToClean.countdownInterval);
            }

            // Notify all players in the room about timeout
            for (const playerId of roomToClean.players) {
                if (bots.has(playerId)) {
                    bots.get(playerId).emit('roomTimeout');
                } else if (ioRef) {
                    const socket = ioRef.sockets.sockets.get(playerId);
                    if (socket) {
                        socket.emit('roomTimeout');
                        socket.leave(roomId);
                    }
                }
            }

            // Clean up spectators
            if (spectators.has(roomId) && ioRef) {
                for (const specId of spectators.get(roomId)) {
                    const specSocket = ioRef.sockets.sockets.get(specId);
                    if (specSocket) {
                        specSocket.emit('roomTimeout');
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

            console.log(`🗑️ Room ${roomId} has been completely cleaned up due to timeout.`);
        }
    }, timeoutDuration);

    rooms.set(roomId, room);
    // Update player activity for the initial player
    updatePlayerActivity(playerId);
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
    if (io && spectators.has(roomId)) {
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
        } else if (io) {
            io.to(playerId).emit(event, data);
        }
    }
    // Always emit to spectators as well
    if (io) {
        emitToSpectators(io, room.roomId, event, data);
    }
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
                // Initialize board update timestamps for all players
                const now = Date.now();
                for (const playerId of room.players) {
                    playerBoardLastUpdated.set(playerId, now);
                }
                emitToRoom(io, room, "StartGame");
                console.log(`🎮 Room ${room.roomId} game started (totalPlayers: ${room.totalPlayers}).`);

                // Clear the timeout now that the game has started
                if (room.timeoutId) {
                    clearTimeout(room.timeoutId);
                    room.timeoutId = null;
                    console.log(`⏱️ Timeout cleared for room ${room.roomId} since the game has started.`);
                }
            }
        }
    }, 1000);
}

function handleGameOver(io, socket, reason, stats) {
    const roomId = playerRoom.get(socket.id);
    if (!roomId || !rooms.has(roomId)) return;
    const room = rooms.get(roomId);

    if (room.isGameOver) {
        return;
    }

    // NEW: Remove the player's board from room.boards immediately when they are game over
    delete room.boards[socket.id];

    // Store player stats
    if (stats) {
        room.stats.set(socket.id, stats);
    }

    if (!playerRanks.has(roomId)) playerRanks.set(roomId, []);
    const ranks = playerRanks.get(roomId);
    // Only add to ranks if not a connection timeout
    if (!ranks.includes(socket.id)) {
        ranks.push(socket.id);
    }

    // Ensure the player is removed from active players map for targeting purposes
    playerRoom.delete(socket.id);

    const activePlayersCount = room.initialPlayers.size - ranks.length;

    // Construct the current ranking order
    const stillPlaying = [...room.initialPlayers].filter(id => !ranks.includes(id));
    const yourRankMap = {};

    // Players still in the game share the top rank
    stillPlaying.forEach(playerId => {
        yourRankMap[playerId] = 1;
    });

    // Assign ranks to knocked-out players
    const knockedOutPlayers = ranks.length;
    ranks.slice().reverse().forEach((playerId, index) => {
        yourRankMap[playerId] = stillPlaying.length + index + 1;
    });

    // Create a sorted list of players by rank for display
    const finalRanks = [...room.initialPlayers]
        .sort((a, b) => yourRankMap[a] - yourRankMap[b]);

    const statsMap = Object.fromEntries(room.stats);
    const rankingData = { ranking: finalRanks, yourRankMap, statsMap, roomId: room.roomId, isGameOver: room.isGameOver };
    emitToRoom(io, room, "ranking", rankingData); // To players
    emitToSpectators(io, room.roomId, "spectatorRanking", rankingData); // To spectators

    // If the game is now over, handle final win/loss emits
    if (activePlayersCount <= 1) {
        room.isGameOver = true;

        const winnerId = finalRanks[0];

        if (winnerId) { // Check if winnerId exists
            if (bots.has(winnerId)) {
                bots.get(winnerId).emit("YouWin");
            } else if (io) {
                io.to(winnerId).emit("YouWin");
            }
        }

        for (const playerId of room.initialPlayers) {
            if (playerId !== winnerId) {
                if (bots.has(playerId)) {
                    bots.get(playerId).emit("GameOver");
                } else if (io) {
                    io.to(playerId).emit("GameOver");
                }
            }
        }
        if (io) {
            emitToSpectators(io, room.roomId, "GameOver");
        }

        // For private rooms, do not reset isGameOver so players can start a new game in the same room
        if (room.isPrivate) {
            // Reset game state but keep the room open
            room.isGameOver = false; // Don't keep it as game over so new games can start
            room.isGameStarted = false;
            room.isCountingDown = false;
            if (room.countdownInterval) {
                clearInterval(room.countdownInterval);
                room.countdownInterval = null;
            }
            // Reset the initialPlayers for the next game
            room.initialPlayers = new Set(room.players); // Use current player for next game
            room.boards = {};
            room.stats.clear();
            // Clear player ranks but don't delete the map
            if (playerRanks.has(roomId)) {
                playerRanks.get(roomId).length = 0;
            }

            // Set a new timeout for the private room to remain available
            if (room.timeoutId) {
                clearTimeout(room.timeoutId);
            }
            const timeoutDuration = 2 * 60 * 60 * 1000; // 2 hours for private room
            room.timeoutId = setTimeout(() => {
                const roomToClean = rooms.get(roomId);
                if (roomToClean && roomToClean.players.size === 0) {
                    // Clean up activity check interval
                    if (roomToClean.activityCheckInterval) {
                        clearInterval(roomToClean.activityCheckInterval);
                    }

                    // Clean up countdown interval if it exists
                    if (roomToClean.countdownInterval) {
                        clearInterval(roomToClean.countdownInterval);
                    }

                    // Notify all players in the room about timeout
                    for (const playerId of roomToClean.players) {
                        if (bots.has(playerId)) {
                            bots.get(playerId).emit('roomTimeout');
                        } else if (ioRef) {
                            const socket = ioRef.sockets.sockets.get(playerId);
                            if (socket) {
                                socket.emit('roomTimeout');
                                socket.leave(roomId);
                            }
                        }
                    }

                    // Clean up spectators
                    if (spectators.has(roomId) && ioRef) {
                        for (const specId of spectators.get(roomId)) {
                            const specSocket = ioRef.sockets.sockets.get(specId);
                            if (specSocket) {
                                specSocket.emit('roomTimeout');
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
                }
            }, timeoutDuration);
            return; // Don't clear timeout if private room is kept open
        }
    }

    // Clear the activity check interval when the game is over
    if (room.activityCheckInterval) {
        clearInterval(room.activityCheckInterval);
        room.activityCheckInterval = null;
    }

    // Clear the timeout when the game is over (only for public rooms or when not keeping private room open)
    if (room.timeoutId) {
        clearTimeout(room.timeoutId);
        room.timeoutId = null;
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
    // Clear player's activity tracking
    playerLastActive.delete(playerIdToKick);
    playerBoardLastUpdated.delete(playerIdToKick);

    // Find the socket of the kicked player and disconnect them from the room
    if (io) {
        const kickedSocket = io.sockets.sockets.get(playerIdToKick);
        if (kickedSocket) {
            kickedSocket.leave(roomId);
            kickedSocket.emit('kicked', { roomId, reason }); // Notify kicked player
            console.log(`🚪 Player ${playerIdToKick} was kicked from room ${roomId}.`);
        }
    }

    if (bots.has(playerIdToKick)) {
        // Handle kicked bot
        bots.get(playerIdToKick).emit('kicked', { roomId, reason });
        // Also untrack the bot socket connection
        untrackSocketConnection(playerIdToKick);
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
        // Clear the timeout when the room is getting cleaned up
        if (room.timeoutId) {
            clearTimeout(room.timeoutId);
            room.timeoutId = null;
        }
        spectators.delete(roomId);
        rooms.delete(roomId);
        console.log(`🗑️ Room ${roomId} deleted due to being empty after a player was kicked.`);
    }
    return true;
}

// Track connected sockets
function trackSocketConnection(socketId) {
    socketConnections.set(socketId, Date.now());
}

// Remove disconnected socket from tracking
function untrackSocketConnection(socketId) {
    socketConnections.delete(socketId);
}

// 30-minute cleanup function for orphaned sockets
function startSocketCleanupInterval() {
    setInterval(() => {
        const now = Date.now();
        const THIRTY_MINUTES = 30 * 60 * 1000; // 30 minutes in milliseconds

        for (const [socketId, connectTime] of socketConnections.entries()) {
            if (now - connectTime > THIRTY_MINUTES) {
                console.log(`⏰ Cleaning up orphaned socket ${socketId} (connected for ${Math.floor((now - connectTime)/1000/60)} minutes)`);

                // Clean up any room references to this socket
                if (playerRoom.has(socketId)) {
                    const roomId = playerRoom.get(socketId);
                    const room = rooms.get(roomId);
                    if (room) {
                        if (room.isGameStarted && !room.isGameOver) {
                            console.log(`⏰ Orphaned socket ${socketId} is in an active game in room ${roomId}. Timing them out.`);
                            handlePlayerTimeout(ioRef, socketId, roomId);
                        } else {
                            // Game not started or already over, safe to remove
                            room.players.delete(socketId);
                            room.initialPlayers.delete(socketId);
                            delete room.boards[socketId];
                        }

                        // If the room becomes empty and game is not over, clean it up
                        if (room.players.size === 0 && !room.isGameOver) {
                            clearInterval(room.countdownInterval);
                            if (room.timeoutId) {
                                clearTimeout(room.timeoutId);
                                room.timeoutId = null;
                            }
                            spectators.delete(roomId);
                            rooms.delete(roomId);
                            console.log(`🗑️ Room ${roomId} deleted due to being empty after socket cleanup.`);
                        }
                    }
                    playerRoom.delete(socketId);
                }

                // Clean up activity tracking
                playerLastActive.delete(socketId);
                playerBoardLastUpdated.delete(socketId);
                playerRanks.forEach((rankArray, roomKey) => {
                    const index = rankArray.indexOf(socketId);
                    if (index > -1) {
                        rankArray.splice(index, 1);
                    }
                });

                // Remove socket from tracking
                socketConnections.delete(socketId);
            }
        }
    }, 60000); // Check every minute
}

module.exports = {
    MAX_PLAYERS, // Export MAX_PLAYERS
    MIN_PLAYERS_TO_START, // Export MIN_PLAYERS_TO_START
    rooms,
    playerRoom,
    playerRanks,
    spectators,
    playerLastActive, // Export player activity tracking map
    playerBoardLastUpdated, // Export board update tracking map
    socketConnections, // Export socket connections tracking map
    createRoom,
    createPrivateRoom, // New export
    getRoomByIdAndPassword, // New export
    getAvailableRoom,
    emitToSpectators,
    startCountdown,
    handleGameOver,
    emitToRoom,
    kickPlayer, // New export
    setIoReference, // Export function to set io reference
    updatePlayerActivity, // Export function to update player activity
    trackSocketConnection, // Export function to track socket connections
    untrackSocketConnection, // Export function to untrack socket connections
    startSocketCleanupInterval // Export function to start socket cleanup interval
};