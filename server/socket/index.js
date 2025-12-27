const { trackSocketConnection, startSocketCleanupInterval } = require('../room.js');
const registerConnectionHandlers = require('./connection.js');
const registerRoomHandlers = require('./room.js');
const registerGameHandlers = require('./game.js');
const registerSpectatorHandlers = require('./spectator.js');

function handleSocketConnection(io, socket) {
    console.log("🚀 User connected:", socket.id);
    socket.isSpectator = false;

    trackSocketConnection(socket.id);

    // Register all modular handlers
    registerConnectionHandlers(io, socket);
    registerRoomHandlers(io, socket);
    registerGameHandlers(io, socket);
    registerSpectatorHandlers(io, socket);
}

function initializeSocket(io) {
    startSocketCleanupInterval();

    io.on("connection", (socket) => {
        handleSocketConnection(io, socket);
    });
}

module.exports = { initializeSocket, handleSocketConnection };
