const MAX_PLAYERS = 99;
const MIN_PLAYERS_TO_START = 2;
const COUNTDOWN_START = 10;

const rooms = new Map();
const playerRoom = new Map();
const playerRanks = new Map();
const spectators = new Map();
let roomCounter = 0;

const { bots } = require('./bots.js');

function createRoom(playerId) {
    roomCounter++;
    const roomId = `room_${roomCounter}`;
    const room = {
        roomId,
        players: new Set([playerId]),
        initialPlayers: new Set([playerId]),
        isCountingDown: false,
        isGameStarted: false,
        isGameOver: false,
        totalPlayers: null,
        boards: {},
        stats: new Map(),
        countdownCount: COUNTDOWN_START,
        countdownInterval: null,
        matchingClosed: false,
        countdownPhase: 1 // 1: matching countdown, 2: game start countdown
    };
    rooms.set(roomId, room);
    return room;
}

function getAvailableRoom() {
    for (const room of rooms.values()) {
        if (!room.isGameStarted && !room.isGameOver && room.players.size < MAX_PLAYERS && !room.matchingClosed) {
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
function emitToRoom(io, room, event, data) {
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
            if (room.players.size < MIN_PLAYERS_TO_START) {
                if (room.players.size >= 1 && room.countdownCount !== COUNTDOWN_START) {
                    room.countdownCount = COUNTDOWN_START;
                    console.log(`🔄 Room ${room.roomId} countdown reset (Phase 1).`);
                }
                const msg = "プレイヤーを待機中です...";
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

    if (room.isGameOver) return;

    // Store player stats
    if (stats) {
        room.stats.set(socket.id, stats);
    }

    if (!playerRanks.has(roomId)) playerRanks.set(roomId, []);
    const ranks = playerRanks.get(roomId);
    if (!ranks.includes(socket.id)) {
        ranks.push(socket.id);
    }

    // Ensure the player is removed from active players immediately
    // The player is now ranked, so they are no longer "active" in the game.
    // We can remove them from playerRoom here, as it's no longer needed for active player count.
    playerRoom.delete(socket.id);

    // Calculate active players based on initial players minus those already ranked
    const activePlayersCount = room.initialPlayers.size - ranks.length;

    if (activePlayersCount <= 1) {
        const allPlayersInRankOrder = [...ranks];
        const remaining = [...room.initialPlayers].find(id => !allPlayersInRankOrder.includes(id));
        
        let finalRanks = [];
        if (remaining) {
            finalRanks.push(remaining); // Winner is first
        }
        // Add the eliminated players in reverse order of elimination
        for (let i = ranks.length - 1; i >= 0; i--) {
            finalRanks.push(ranks[i]);
        }

        const yourRankMap = Object.fromEntries(
            [...room.initialPlayers].map(id => [id, finalRanks.indexOf(id) + 1])
        );

        const statsMap = Object.fromEntries(room.stats);

        const rankingData = { ranking: finalRanks, yourRankMap, statsMap, roomId: room.roomId };
        emitToRoom(io, room, "ranking", rankingData);

        const winnerId = finalRanks[0]; // The first player in finalRanks is the winner

        // Emit "YouWin" to the winner
        if (bots.has(winnerId)) {
            bots.get(winnerId).emit("YouWin");
        } else {
            io.to(winnerId).emit("YouWin");
        }

        // Emit "GameOver" to all other players (losers)
        for (const playerId of room.initialPlayers) { // Iterate through initialPlayers to ensure all participants get a message
            if (playerId !== winnerId) {
                if (bots.has(playerId)) {
                    bots.get(playerId).emit("GameOver");
                } else {
                    io.to(playerId).emit("GameOver");
                }
            }
        }
        emitToSpectators(io, room.roomId, "GameOver"); // Spectators still get generic GameOver

        room.isGameOver = true;
        setTimeout(() => {
            spectators.delete(roomId);
            rooms.delete(roomId);
            playerRanks.delete(roomId);
            console.log(`🗑️ Room ${roomId} deleted after game over.`);
        }, 30000);
        return;
    }

    const tempRanks = [...ranks].reverse();
    const yourRankMap = Object.fromEntries(
        [...room.initialPlayers].map(id => {
            const rankIndex = tempRanks.indexOf(id);
            return [id, rankIndex !== -1 ? rankIndex + activePlayersCount + 1 : null];
        })
    );
    const statsMap = Object.fromEntries(room.stats);

    const rankingData = { ranking: ranks, yourRankMap, statsMap, roomId: room.roomId };
    emitToRoom(io, room, "ranking", rankingData);
    emitToRoom(io, room, "playerKO", socket.id);
}

module.exports = {
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
};