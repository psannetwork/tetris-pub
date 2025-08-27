
const MAX_PLAYERS = 99;
const MIN_PLAYERS_TO_START = 2;
const COUNTDOWN_START = 10;

const rooms = new Map();
const playerRoom = new Map();
const playerRanks = new Map();
const spectators = new Map();
let roomCounter = 0;

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
        countdownCount: COUNTDOWN_START,
        countdownInterval: null
    };
    rooms.set(roomId, room);
    return room;
}

function getAvailableRoom() {
    for (const room of rooms.values()) {
        if (!room.isGameStarted && !room.isGameOver && room.players.size < MAX_PLAYERS) {
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

function startCountdown(io, room) {
    if (!room || room.isCountingDown || room.isGameStarted) return;
    room.isCountingDown = true;
    room.countdownCount = COUNTDOWN_START;

    console.log(`⏳ Room ${room.roomId} countdown started.`);
    room.countdownInterval = setInterval(() => {
        if (!rooms.has(room.roomId)) {
            clearInterval(room.countdownInterval);
            return;
        }
        if (room.players.size < MIN_PLAYERS_TO_START) {
            if (room.players.size === 1 && room.countdownCount !== COUNTDOWN_START) {
                room.countdownCount = COUNTDOWN_START;
                console.log(`🔄 Room ${room.roomId} countdown reset.`);
            }
            const msg = "プレイヤーを待機中です...";
            io.to(room.roomId).emit("CountDown", msg);
            emitToSpectators(io, room.roomId, "CountDown", msg);
            return;
        }

        io.to(room.roomId).emit("CountDown", room.countdownCount);
        emitToSpectators(io, room.roomId, "CountDown", room.countdownCount);
        console.log(`⏳ Room ${room.roomId} countdown: ${room.countdownCount}`);
        room.countdownCount--;

        if (room.countdownCount < 0 || room.players.size >= MAX_PLAYERS) {
            clearInterval(room.countdownInterval);
            room.isCountingDown = false;
            room.isGameStarted = true;
            room.totalPlayers = room.initialPlayers.size;
            io.to(room.roomId).emit("StartGame");
            emitToSpectators(io, room.roomId, "StartGame");
            console.log(`🎮 Room ${room.roomId} game started (totalPlayers: ${room.totalPlayers}).`);
        }
    }, 1000);
}

function handleGameOver(io, socket, reason) {
    const roomId = playerRoom.get(socket.id);
    if (!roomId || !rooms.has(roomId)) return;
    const room = rooms.get(roomId);

    if (room.isGameOver) return;

    if (!playerRanks.has(roomId)) playerRanks.set(roomId, []);
    const ranks = playerRanks.get(roomId);
    if (!ranks.includes(socket.id)) ranks.push(socket.id);

    playerRoom.delete(socket.id);

    const totalPlayers = room.totalPlayers || room.initialPlayers.size;

    if (ranks.length === totalPlayers - 1) {
        const remaining = [...room.initialPlayers].find(id => !ranks.includes(id));
        if (remaining) ranks.push(remaining);

        const yourRankMap = Object.fromEntries(
            [...room.initialPlayers].map(id => [id, totalPlayers - ranks.indexOf(id)])
        );

        io.to(room.roomId).emit("ranking", { ranking: ranks, yourRankMap });
        emitToSpectators(io, room.roomId, "ranking", { ranking: ranks, yourRankMap });
        io.to(room.roomId).emit("GameOver");
        emitToSpectators(io, room.roomId, "GameOver");

        room.isGameOver = true;
        setTimeout(() => {
            spectators.delete(roomId);
            rooms.delete(roomId);
            playerRanks.delete(roomId);
            console.log(`🗑️ Room ${roomId} deleted after game over.`);
        }, 30000);
        return;
    }

    const yourRankMap = Object.fromEntries(
        [...room.initialPlayers].map(id => [
            id,
            ranks.includes(id)
                ? totalPlayers - ranks.indexOf(id)
                : (ranks.length === totalPlayers - 1 ? 1 : null)
        ])
    );

    io.to(room.roomId).emit("ranking", { ranking: ranks, yourRankMap });
    io.to(room.roomId).emit("playerKO", socket.id);
    emitToSpectators(io, room.roomId, "ranking", { ranking: ranks, yourRankMap });
    emitToSpectators(io, room.roomId, "playerKO", socket.id);
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
    handleGameOver
};