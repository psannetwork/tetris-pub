const {
    rooms,
    playerRoom,
    playerRanks,
    updatePlayerActivity,
    handleGameOver,
    emitToRoom,
    emitToSpectators,
    kickPlayer,
    playerBoardLastUpdated
} = require('../room.js');
const { bots } = require('../bots.js');

const playerActivity = new Map();
const MAX_UPDATES_PER_SECOND = 60;
const MAX_GARBAGE_LINES_SINGLE_ATTACK = 10;

function registerGameHandlers(io, socket) {
    socket.on('setTarget', (targetId) => {
        const roomId = playerRoom.get(socket.id);
        if (!roomId || !rooms.has(roomId)) return;
        const room = rooms.get(roomId);
        if (!room || room.isGameOver) return;

        playerBoardLastUpdated.set(socket.id, Date.now());
        updatePlayerActivity(socket.id);
        room.playerTargets.set(socket.id, targetId);
    });

    socket.on("BoardStatus", (board) => {
        const roomId = playerRoom.get(socket.id);
        if (!roomId || !rooms.has(roomId)) return;
        const room = rooms.get(roomId);
        if (!room || room.isGameOver) return;

        // Ignore updates from players who are already out
        const ranks = playerRanks.get(roomId) || [];
        if (ranks.includes(socket.id)) return;

        playerBoardLastUpdated.set(socket.id, Date.now());
        updatePlayerActivity(socket.id);

        if (!playerActivity.has(socket.id)) {
            playerActivity.set(socket.id, {
                lastUpdate: Date.now(),
                updateCount: 0,
                updateResetTime: Date.now()
            });
        }

        const activity = playerActivity.get(socket.id);
        const now = Date.now();

        if (now - activity.updateResetTime >= 1000) {
            activity.updateResetTime = now;
            activity.updateCount = 0;
        }

        activity.updateCount++;
        if (activity.updateCount > MAX_UPDATES_PER_SECOND) {
            console.warn(`⚠️ Player ${socket.id} exceeded update rate limit`);
            kickPlayer(io, roomId, socket.id, "通信が異常な速度で送信されました。");
            return;
        }

        activity.lastUpdate = now;

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
            handleGameOver(io, socket, "bot game over", null);
        }
    });

    socket.on("SendGarbage", ({ targetId, lines }) => {
        const roomId = playerRoom.get(socket.id);
        if (!roomId || !rooms.has(roomId)) return;
        const room = rooms.get(roomId);
        if (!room || room.isGameOver || room.players.size <= 1) return;

        // Ignore input from players who are already out
        const ranks = playerRanks.get(roomId) || [];
        if (ranks.includes(socket.id)) return;

        playerBoardLastUpdated.set(socket.id, Date.now());
        updatePlayerActivity(socket.id);

        if (typeof lines !== 'number' || lines <= 0 || lines > MAX_GARBAGE_LINES_SINGLE_ATTACK) {
            kickPlayer(io, roomId, socket.id, "不正な攻撃データを送信しました。");
            return;
        }

        let recipient = targetId || room.playerTargets.get(socket.id);
        const members = [...room.players];

        if (!recipient || !members.includes(recipient) || ranks.includes(recipient)) {
            const candidates = members.filter(id => id !== socket.id && !ranks.includes(id));
            if (!candidates.length) return;
            recipient = candidates[Math.floor(Math.random() * candidates.length)];
            room.playerTargets.set(socket.id, recipient);
            emitToRoom(io, room, 'targetsUpdate', Array.from(room.playerTargets.entries()));
        }

        const emitData = { from: socket.id, lines, to: recipient };
        if (bots.has(recipient)) {
            bots.get(recipient).emit("ReceiveGarbage", emitData);
        } else {
            io.to(recipient).emit("ReceiveGarbage", emitData);
        }

        emitToRoom(io, room, "GarbageTransfer", { from: socket.id, to: recipient, lines });
    });
}

module.exports = registerGameHandlers;
