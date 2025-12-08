import { CONFIG } from './config.js';
import { tetrominoTypeToIndex } from './draw.js';
import { MAIN_BOARD_CELL_SIZE, BOARD_WIDTH, BOARD_HEIGHT, ATTACK_BAR_WIDTH, HOLD_BOX_WIDTH, NEXT_BOX_WIDTH, ATTACK_BAR_GAP, HOLD_BOX_GAP, NEXT_BOX_GAP, TOTAL_WIDTH } from './layout.js';
import { showCountdown, showGameEndScreen, hideGameEndScreen } from './ui.js';
import { resetGame, setGameState, gameState, triggerGameOver, setGameClear, setHoldPiece, setNextPieces, initializePieces } from './game.js';
import { addAttackBar } from './garbage.js';
import { createLightOrb, triggerTargetAttackFlash, targetAttackFlashes, addTextEffect, clearAllEffects, triggerReceivedAttackEffect, startMiniboardEntryEffect, miniboardEntryEffects } from './effects.js'; // Added clearAllEffects and triggerReceivedAttackEffect
import { drawUI } from './draw.js';
import { setRoomDisplayState } from './main.js'; // Import setRoomDisplayState

export let socket;
let shouldAutoMatchOnReconnect = true; // Flag to control auto-matching

let currentSocketId = null; // To track current socket ID
const myPastSocketIds = new Set(); // To store past socket IDs of this client

const HEARTBEAT_INTERVAL_MS = 5000; // Send heartbeat every 5 seconds
let heartbeatIntervalId = null; // To store the interval ID
export let isSpectating = false; // NEW: Track if current client is spectating

export function setSpectating(value) { // NEW: Setter for isSpectating
    isSpectating = value;
}

export function setAutoMatchOnReconnect(value) {
    shouldAutoMatchOnReconnect = value;
}

export function initializeSocket() {
    if (socket) {
        // If socket exists and is connected, record its ID before disconnecting
        if (socket.connected && getCurrentRoomId()) {
            myPastSocketIds.add(currentSocketId);
        }
        socket.disconnect();
    }

    socket = io(CONFIG.serverUrl, {
        autoConnect: false,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000,
        transports: ['websocket', 'polling']
    });

    // --- Socket Event Handlers ---
    socket.on("connect", () => {
        console.log("✅ サーバーに接続:", socket.id);
        
        // Update currentSocketId and clear past IDs if this is a fresh connection (or not a reconnect)
        if (currentSocketId && currentSocketId !== socket.id) {
            myPastSocketIds.add(currentSocketId); // Add previous ID to past IDs
        }
        currentSocketId = socket.id; // Update current ID

        miniboardSlots.forEach(slot => {
            slot.userId = null;
            slot.dirty = true;
        });
        finalRanking = {}; // Reset on new connection
        finalStatsMap = {}; // Reset on new connection

        // Start heartbeat
        if (heartbeatIntervalId) {
            clearInterval(heartbeatIntervalId);
        }
        heartbeatIntervalId = setInterval(() => {
            if (socket.connected) {
                socket.emit('heartbeat');
            }
        }, HEARTBEAT_INTERVAL_MS);

        if (wasManualDisconnect() && shouldAutoMatchOnReconnect) {
            setManualDisconnect(false);
            startMatching(); // auto-retry
        } else if (wasManualDisconnect()) {
            // If manual disconnect but auto-match disabled, just go to lobby
            setManualDisconnect(false);
            setGameState('LOBBY');
            hideConnectionError();
        } else {
            setGameState('LOBBY'); // Ensure client is in lobby state on connect
            hideConnectionError();
        }
    });

        socket.on('targetsUpdate', (targets) => {

            playerTargets = new Map(targets);

            // We need to redraw the miniboards to update their target styles

            miniboardSlots.forEach(slot => slot.dirty = true);

        });

    

                                socket.on("roomInfo", (data) => {

    

                                    setCurrentRoomId(data.roomId); // Use setter function to update currentRoomId

    

                            clearAllEffects(); // Clear all effects when entering a new room

    

                            const currentOpponents = new Set(miniboardSlots.filter(s => s.userId).map(s => s.userId));

    

                            const newOpponentIds = new Set(data.members.filter(id => id !== socket.id));

    

                        // Add new opponents

    

                        newOpponentIds.forEach(id => {

    

                            if (!currentOpponents.has(id)) addOpponent(id);

    

                        });

    

                

    

                        // Remove disconnected opponents

    

                        currentOpponents.forEach(id => {

    

                            if (!newOpponentIds.has(id)) removeOpponent(id);

    

                        });

    

            

    

                        // Update UI with room info

    

                        setGameState('ROOM_LOBBY');

    

                        setRoomDisplayState(true, data.hostId === socket.id, data.roomId, data.members, data.isPrivate);

    

                    });

    

                socket.on("StartGame", () => {

    

                    currentCountdown = null;

    

                    showCountdown(null);

    

                    hideGameEndScreen(); // Hide end screen

    

                    resetGame(); // Changed to resetGame()

    

                    initializePieces(); // Initialize pieces for the player

    

                    setHoldPiece(null); // Moved from CountDown

    

                    drawUI();           // Moved from CountDown

    

                    setGameState('PLAYING');

    

                    // Close menu when game starts

    

                    if (closeMenuCallback) {

    

                        closeMenuCallback();

    

                    }

            miniboardSlots.forEach(slot => {

                if (slot.userId) { // Only reset boards for active opponents

                    slot.isGameOver = false;

                    slot.boardState.forEach(row => row.fill(0)); // Clear the board state

                    slot.dirty = true;

                }

            });

            finalRanking = {}; // Reset for new game
            finalStatsMap = {}; // Reset for new game

            lastSentBoard = null; // Ensure board history is cleared for the new game

        });

    

                        socket.on("ranking", (data) => {

    

                            const { yourRankMap, statsMap, roomId } = data;

    

                            if (roomId !== getCurrentRoomId()) {

    

                                return;

    

                            }

    

                            

    

                            Object.assign(finalRanking, yourRankMap);

    

                            Object.assign(finalStatsMap, statsMap); // NEW

    

                            

    

                            miniboardSlots.forEach(slot => {

    

                                if (slot.userId && !finalRanking.hasOwnProperty(slot.userId)) {

    

                                    finalRanking[slot.userId] = null;

    

                                }

    

                            });

    

                            

    

                            if (!finalRanking.hasOwnProperty(socket.id)) {

    

                                finalRanking[socket.id] = null;

    

                            }

    

                            

    

                            miniboardSlots.forEach(slot => {

    

                                if (slot.userId && finalRanking[slot.userId] > 1 && !slot.isGameOver) {

    

                                    slot.isGameOver = true;

    

                                    slot.dirty = true;

    

                                }

    

                            });

    

                            

    

    

                            const myRank = finalRanking[socket.id];

    

                            

    

                            if ((myRank === null || myRank === undefined) && !isSpectating) {

    

                                setGameState('PLAYING');

    

                                return;

    

                            }

    

                            

    

                            const totalPlayers = Object.keys(finalRanking).length;

    

                            const knockedOutPlayers = Object.values(finalRanking).filter(r => r > 1).length;

    

                            const isMatchOver = (knockedOutPlayers >= totalPlayers - 1 && totalPlayers > 1);

    

                            const amKnockedOut = myRank > 1;

    

                            

    

                            if (isMatchOver) {

    

                                setGameState('GAME_OVER');

    

                                const isWin = myRank === 1;

    

                                const title = isWin ? 'You Win!' : 'Game Over';

    

                                if (isWin) setGameClear(true);

    

                                showGameEndScreen(title, isWin, finalRanking, socket.id, finalStatsMap || {});

    

                            } else if (amKnockedOut) {

    

                                setGameState('GAME_OVER');

    

                                const gameEndOverlay = document.getElementById('game-end-overlay');

    

                                if (gameEndOverlay && !gameEndOverlay.classList.contains('visible')) {

    

                                    showGameEndScreen('Game Over', false, finalRanking, socket.id, finalStatsMap || {});

    

                                }

    

                            } else {

    

                                setGameState('PLAYING');

    

                            }

    

                        });

    

            

    

                socket.on("YouWin", () => {

    

                    setGameState('GAME_OVER');

    

                    showGameEndScreen('You Win!', true, finalRanking, socket.id, finalStatsMap || {});

    

                });

    

            

    

                socket.on("GameOver", () => {

    

                    setGameState('GAME_OVER');

    

                    showGameEndScreen('Game Over', false, finalRanking, socket.id, finalStatsMap || {});

    

                });

    

                socket.on("BoardStatus", (data) => {

    

                    if (gameState !== 'PLAYING' && gameState !== 'SPECTATING') return; // NEW: Allow spectating

    

        

            const { UserID, board, diff } = data;

            let slot = miniboardSlots.find(s => s.userId === UserID);

            if (!slot) {

                // Only add opponent if this isn't our own board data

                // This prevents duplicate creation during game state transitions

                if (UserID !== socket.id) {

                    addOpponent(UserID);

                    slot = miniboardSlots.find(s => s.userId === UserID);

                }

            }

            if (slot) updateSlotBoard(slot, board, diff);

        });

    

                socket.on("BoardStatusBulk", (boards) => {

    

                    if (gameState !== 'PLAYING' && gameState !== 'SPECTATING') return; // NEW: Allow spectating

    

        

            for (const userId in boards) {

                const boardData = boards[userId];

                if (!boardData) continue;

                let slot = miniboardSlots.find(s => s.userId === userId);

                if (!slot) {

                    // Only add opponent if this isn't our own board data

                    // This prevents duplicate creation during game state transitions

                    if (userId !== socket.id) {

                        addOpponent(userId);

                        slot = miniboardSlots.find(s => s.userId === userId);

                    }

                }

                if (slot) updateSlotBoard(slot, boardData.board, boardData.diff);

            }

        });

    

        socket.on("PlayerDisconnected", ({ userId }) => {

            removeOpponent(userId);

        });

    

        socket.on("CountDown", (count) => {

            currentCountdown = count;

            showCountdown(count);

        });

    

                socket.on("ReceiveGarbage", ({ from, lines, to }) => { // Added 'to'

    

                    if (!isSpectating) { // Only players have an attack bar

    

                        addAttackBar(lines);

    

                    }

    

        

    

                    let attackerPos;

    

                    if (from) {

    

                        attackerPos = getBoardCenterPosition(from);

    

                    } else {

    

                        // If no attacker (e.g., system garbage), use a default position

    

                        attackerPos = { x: BOARD_WIDTH / 2, y: 0 };

    

                    }

    

        

    

                    // Determine the target position for the light orb effect

    

                    let targetForOrbPos;

    

                    if (isSpectating) {

    

                        // In spectator mode, the 'to' field indicates who received garbage

    

                        targetForOrbPos = getBoardCenterPosition(to);

    

                    } else {

    

                        // In player mode, the local player is the recipient

    

                        targetForOrbPos = getBoardCenterPosition(socket.id);

    

                    }

    

        

    

                    if (targetForOrbPos) {

    

                        createLightOrb(attackerPos, targetForOrbPos);

    

                    } else {

    

                        // Fallback for createLightOrb if target position cannot be determined

    

                        // This fallback logic was originally for 'myPos' (local player)

    

                        // For spectators, if 'to' does not yield a position,

    

                        // and for players if 'socket.id' does not yield a position,

    

                        // we use a general center position on the main board.

    

                        const wrapper = document.getElementById('overall-game-wrapper');

    

                        if (wrapper) {

    

                            const wrapperRect = wrapper.getBoundingClientRect();

    

                            const mainBoard = document.getElementById('main-game-board');

    

                            if (mainBoard) {

    

                                const boardRect = mainBoard.getBoundingClientRect();

    

                                const x = boardRect.left - wrapperRect.left + boardRect.width / 2;

    

                                const y = boardRect.top - wrapperRect.top + boardRect.height / 2;

    

                                createLightOrb(attackerPos, { x, y });

    

                            }

    

                        }

    

                    }

    

        

    

                    // Trigger visual effect for received attack only for the actual player

    

                    if (!isSpectating) {

    

                        triggerReceivedAttackEffect();

    

                    }

    

                });

    

        socket.on("GarbageTransfer", ({ from, to, lines }) => {

            // Don't draw the effect if I am the one receiving it,

            // as ReceiveGarbage already handles that.

            if (to === socket.id) return;

    

            const fromPos = getBoardCenterPosition(from);

            const toPos = getBoardCenterPosition(to);

    

            if (fromPos && toPos) {

                createLightOrb(fromPos, toPos);

            }

        });

    

                socket.on("disconnect", (reason) => {

    

                    console.log(`❌ サーバーから切断されました: ${reason}`);

    

                    if (heartbeatIntervalId) {

    

                        clearInterval(heartbeatIntervalId);

    

                        heartbeatIntervalId = null;

    

                    }

    

        

    

                    if (!wasManualDisconnect()) {

    

                        showConnectionError();

    

                    }

    

                });

    

                socket.on("connect_error", (err) => {

    

                    console.error(`接続エラー: ${err.message}`);

    

                    if (heartbeatIntervalId) {

    

                        clearInterval(heartbeatIntervalId);

    

                        heartbeatIntervalId = null;

    

                    }

    

                    showConnectionError();

    

                });

    

        socket.on("reconnect", (attemptNumber) => {

            console.log("✅ サーバーに再接続しました", `Attempt #${attemptNumber}`);

            hideConnectionError();

            socket.emit('requestRoomInfo');

            resetGame();

            setGameState('LOBBY'); // Ensure client is in lobby state on reconnect

    

            // If was manually disconnected but not through UI actions, attempt to rejoin

            if (!wasManualDisconnect()) {

                // Check if we were in a room before, and rejoin if needed

                socket.emit('requestRoomInfo');

            }

        });

    

                        socket.on("reconnect_failed", () => {

    

                            console.error("再接続に失敗しました");

    

                            if (heartbeatIntervalId) {

    

                                clearInterval(heartbeatIntervalId);

    

                                heartbeatIntervalId = null;

    

                            }

    

                            showConnectionError();

    

                        });

    

        

    

            // NEW: uiMessage handler

    

            socket.on('uiMessage', (data) => {

    

                if (uiMessageCallback) {

    

                    uiMessageCallback(data);

    

                } else {

    

                    console.warn("uiMessage received but no callback registered:", data);

    

                }

    

            });

    

        

    

            socket.on("roomClosed", () => {

            console.log("ルームが閉鎖されました");

            // Set game state to lobby and reset game

            setGameState('LOBBY');

            resetGame();

            // Call the callback if available

            if (roomClosedCallback) {

                roomClosedCallback();

            } else {

                // Fallback - this shouldn't happen if main.js sets the callback

                alert('ルームがホストによって閉鎖されました。');

                        }

                    });

            

                    // NEW: publicRoomsList handler

                    socket.on('publicRoomsList', (rooms) => {

                        if (publicRoomsListCallback) {

                            publicRoomsListCallback(rooms);

                        } else {

                            console.warn("publicRoomsList received but no callback registered:", rooms);

                        }

                    });

            

                    // NEW: spectateRoomInfo handler

                    socket.on('spectateRoomInfo', (data) => {

                        if (spectateRoomInfoCallback) {

                            spectateRoomInfoCallback(data);

                        } else {

                            console.warn("spectateRoomInfo received but no callback registered:", data);

                        }

                    });

            

                    socket.connect(); // Connect the socket after all event handlers are registered

                }

    

    export let playerTargets = new Map();

    

export let currentCountdown = null;

let manualDisconnect = false;

export function setManualDisconnect(value) {
    manualDisconnect = value;
}

export function wasManualDisconnect() {
    return manualDisconnect;
}

export let isManualDisconnect = false; // New flag for manual disconnect

// --- Callback for stats ---
let getStatsCallback = () => ({ score: 0, lines: 0, level: 1, time: '0.00', pps: 0, apm: 0 });

// --- Callback for closing menu when game starts ---
let closeMenuCallback = null;

// --- Callback for room closed event ---
let roomClosedCallback = null;

// NEW: Callback for uiMessage
let uiMessageCallback = null;

export function setOnlineGetStatsCallback(callback) {
    getStatsCallback = callback;
}

export function setCloseMenuCallback(callback) {
    closeMenuCallback = callback;
}

export function setRoomClosedCallback(callback) {
    roomClosedCallback = callback;
}

// NEW: Export function to set uiMessage callback
export function setUIMessageCallback(callback) {
    uiMessageCallback = callback;
}

// --- Opponent State Management ---
export const miniboardSlots = [];
const leftMiniboardsGroup = document.getElementById('left-miniboards-group');
const rightMiniboardsGroup = document.getElementById('right-miniboards-group');

export let MINIBOARD_CELL_SIZE;
export let MINIBOARD_WIDTH;
export let MINIBOARD_HEIGHT;
export let MINIBOARD_GAP;

const MINIBOARDS_PER_COLUMN = 7;
const NUM_GAPS_PER_COLUMN = MINIBOARDS_PER_COLUMN - 1;

function setupMiniboardDimensions() {
    MINIBOARD_CELL_SIZE = 3.5; // Keep this for canvas drawing dimensions
    MINIBOARD_HEIGHT = CONFIG.board.visibleRows * MINIBOARD_CELL_SIZE; // e.g. 20 * 3.5 = 70
    MINIBOARD_WIDTH = CONFIG.board.cols * MINIBOARD_CELL_SIZE; // e.g. 10 * 3.5 = 35
}

// Call dimensions setup once on load.
setupMiniboardDimensions();

function setupMiniboardSlots() {
    leftMiniboardsGroup.innerHTML = '';
    rightMiniboardsGroup.innerHTML = '';
    miniboardSlots.length = 0;
    const totalMiniboards = 98;
    for (let i = 0; i < totalMiniboards; i++) {
        const canvas = document.createElement('canvas');
        canvas.width = MINIBOARD_WIDTH;
        canvas.height = MINIBOARD_HEIGHT;
        canvas.className = 'miniboard';
        
        if (i < 49) {
            leftMiniboardsGroup.appendChild(canvas);
        } else {
            rightMiniboardsGroup.appendChild(canvas);
        }

        const slot = {
            userId: null,
            boardState: Array.from({ length: CONFIG.board.rows }, () => Array(CONFIG.board.cols).fill(0)),
            isGameOver: false,
            canvas: canvas,
            ctx: canvas.getContext('2d'),
            isNew: false,
            effect: null,
            dirty: true
        };

        canvas.addEventListener('click', () => {
            if (slot.userId && gameState === 'PLAYING') {
                setTarget(slot.userId);
            }
        });

        miniboardSlots.push(slot);
    }
}

// Setup slots on initial load
window.addEventListener('load', setupMiniboardSlots);



function addOpponent(userId) {
    if (userId === socket.id) return;
    // NEW: Also check if userId is one of our past socket IDs
    if (myPastSocketIds.has(userId)) {
        console.warn(`Attempted to add old self (ID: ${userId}) as opponent. Ignoring.`);
        return;
    }
    const existingSlot = miniboardSlots.find(slot => slot.userId === userId);
    if (existingSlot) return;

    // Find all empty slots
    const emptySlots = miniboardSlots.filter(slot => slot.userId === null);

    if (emptySlots.length > 0) {
        // Pick a random empty slot
        const randomIndex = Math.floor(Math.random() * emptySlots.length);
        const emptySlot = emptySlots[randomIndex];

        emptySlot.userId = userId;
        emptySlot.isGameOver = false;
        emptySlot.boardState.forEach(row => row.fill(0));
        emptySlot.isNew = true; // Add this flag for the effect
        emptySlot.dirty = true;

        // Start the effect via effects.js
        if (gameState !== 'PLAYING') { // Check gameState here
            const pos = getBoardCenterPosition(userId); // Get center position of the miniboard
            if (pos) {
                startMiniboardEntryEffect(userId, pos.x - MINIBOARD_WIDTH / 2, pos.y - MINIBOARD_HEIGHT / 2, MINIBOARD_WIDTH, MINIBOARD_HEIGHT);
            }
        }
    }
}

function removeOpponent(userId) {
    const slot = miniboardSlots.find(slot => slot.userId === userId);
    if (slot) {
        slot.userId = null;
        slot.dirty = true;
    }
}

function updateSlotBoard(slot, boardData, diffData) {
    if (boardData) {
        slot.boardState = boardData;
    } else if (diffData) {
        diffData.forEach(({ r, c, val }) => {
            if (slot.boardState[r]) slot.boardState[r][c] = val;
        });
    }
    slot.dirty = true;
    startAnimationIfNeeded();
}

function drawMiniBoard(slot, currentTime) {
    const { ctx, canvas, boardState, isGameOver, userId } = slot; // Removed 'effect' from destructuring
    if (!slot.dirty) return; // Only check dirty flag

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvas.style.display = 'block';

    // If no user, draw an empty, bordered slot
    if (userId === null) {
        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);
        slot.dirty = false;
        return;
    }

    // This part of the drawing logic will now correctly handle the KO display persistence.
    if (isGameOver) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'red';
        ctx.font = `bold ${canvas.width / 3.5}px ${CONFIG.ui.fontFamily}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("KO", canvas.width / 2, canvas.height / 2);
        // Do not set dirty to false, so it persists
        return;
    }

    // Draw the actual miniboard content
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Pre-calculate values to avoid repeated calculations
    const startRow = CONFIG.board.rows - CONFIG.board.visibleRows;
    const garbageColor = CONFIG.colors.garbage;
    const garbageBorder = MINIBOARD_CELL_SIZE * 0.15;
    const garbageInnerSize = MINIBOARD_CELL_SIZE - garbageBorder * 2;

    // Create a color cache to avoid repeated color lookups
    const colorCache = new Map();

    for (let r = 0; r < CONFIG.board.visibleRows; r++) {
        const boardRow = boardState[startRow + r];
        if (!boardRow) continue;

        for (let c = 0; c < CONFIG.board.cols; c++) {
            const block = boardRow[c];
            if (block === 0) continue;

            // Precalculate positions
            const x = c * MINIBOARD_CELL_SIZE;
            const y = r * MINIBOARD_CELL_SIZE;

            if (block === 'G') {
                // Draw garbage blocks
                ctx.fillStyle = '#222';
                ctx.fillRect(x, y, MINIBOARD_CELL_SIZE, MINIBOARD_CELL_SIZE);
                ctx.fillStyle = garbageColor;
                ctx.fillRect(x + garbageBorder, y + garbageBorder, garbageInnerSize, garbageInnerSize);
            } else {
                // Get type index and color
                let color = colorCache.get(block);
                if (!color) {
                    const typeIndex = tetrominoTypeToIndex(block);
                    color = CONFIG.colors.tetromino[typeIndex + 1] || "#808080";
                    colorCache.set(block, color);
                }

                ctx.fillStyle = color;
                ctx.fillRect(x, y, MINIBOARD_CELL_SIZE, MINIBOARD_CELL_SIZE);
            }
        }
    }

    slot.dirty = false;
}

let animationFrameId = null;

export function drawAllMiniBoards() {
    const currentTime = performance.now();
    // Only draw dirty slots for better performance
    for (const slot of miniboardSlots) {
        if (slot.dirty) {
            drawMiniBoard(slot, currentTime);
        }
    }

    // Check if any miniboards need redrawing OR if the game is playing/spectating and there are opponents
    const hasDirtySlots = miniboardSlots.some(slot => slot.dirty);
    const hasActiveOpponents = miniboardSlots.some(slot => slot.userId !== null && slot.userId !== socket.id);

    // Continue requesting animation frames if playing/spectating with active opponents,
    // or if there are still dirty slots to draw.
    if ((gameState === 'PLAYING' || gameState === 'SPECTATING') && hasActiveOpponents) {
        animationFrameId = requestAnimationFrame(drawAllMiniBoards);
    } else if (hasDirtySlots) { // Keep redrawing dirty slots even if not playing/spectating with opponents
        animationFrameId = requestAnimationFrame(drawAllMiniBoards);
    } else {
        animationFrameId = null;
    }
}

function startAnimationIfNeeded() {
    if (!animationFrameId) {
        animationFrameId = requestAnimationFrame(drawAllMiniBoards);
    }
}

export let finalRanking = {}; // To store all player ranks
export let finalStatsMap = {}; // To store all player stats
let currentRoomId = null; // To store the current room ID

export function setCurrentRoomId(id) {
    currentRoomId = id;
}

export function getCurrentRoomId() {
    return currentRoomId;
}

export function drawTargetLines(ctx) {
    if (!ctx || !socket.connected) {
        return;
    }
    if (!socket.id) {
        return;
    }

    const myId = socket.id;
    const myPos = getBoardCenterPosition(myId);
    if (!myPos) {
        return;
    }

    const now = performance.now();

    for (const [attackerId, targetId] of playerTargets.entries()) {
        // Draw lines from attackers to me, but only if the attacker is still playing
        if (targetId === myId) {
            // Check if the attacker is still in the game (not KO) - they should not be in finalRanking or have a rank > 1
            const attackerIsGameOver = finalRanking.hasOwnProperty(attackerId) && finalRanking[attackerId] > 1;
            if (!attackerIsGameOver) {
                const attackerPos = getBoardCenterPosition(attackerId);
                if (attackerPos) {
                    ctx.beginPath();
                    ctx.moveTo(attackerPos.x, attackerPos.y);
                    ctx.lineTo(myPos.x, myPos.y);
                    ctx.strokeStyle = 'rgba(255, 255, 102, 0.7)'; // Yellowish
                    ctx.lineWidth = 1;
                    ctx.stroke();
                } else {
                    // console.log(`drawTargetLines: Attacker ${attackerId} pos is null, cannot draw line to me.`);
                }
            }
        }

        // Draw line from me to my target, but only if I'm still in the game and target is still playing
        if (attackerId === myId && targetId) {
            const myIsGameOver = finalRanking.hasOwnProperty(myId) && finalRanking[myId] > 1;
            const targetIsGameOver = finalRanking.hasOwnProperty(targetId) && finalRanking[targetId] > 1;

            if (!myIsGameOver && !targetIsGameOver) {
                const targetPos = getBoardCenterPosition(targetId);
                if (targetPos) {
                    const isFlashing = targetAttackFlashes.has(myId) && now < targetAttackFlashes.get(myId);

                    ctx.beginPath();
                    ctx.moveTo(myPos.x, myPos.y);
                    ctx.lineTo(targetPos.x, targetPos.y);
                    ctx.strokeStyle = isFlashing ? '#FFFFFF' : '#FFFF66';
                    ctx.lineWidth = isFlashing ? 3 : 1.5;
                    ctx.stroke();
                } else {
                    // console.log(`drawTargetLines: Target ${targetId} pos is null, cannot draw line from me.`);
                }
            }
        }
    }
}

// --- Attack Effect Helpers ---
export function getBoardCenterPosition(userId, clearedLines = null) {
    // Use the effects canvas to get consistent positioning
    const effectsCanvas = document.getElementById('effect-canvas');
    if (!effectsCanvas) return null;

    const effectsCanvasRect = effectsCanvas.getBoundingClientRect();
    const wrapper = document.getElementById('overall-game-wrapper');
    if (!wrapper) return null;
    const wrapperRect = wrapper.getBoundingClientRect();

    let targetRect;

    if (userId === socket.id) {
        const mainBoard = document.getElementById('main-game-board');
        if (!mainBoard) return null;
        targetRect = mainBoard.getBoundingClientRect();
    } else {
        const slot = miniboardSlots.find(s => s.userId === userId);
        if (slot && slot.canvas) {
            targetRect = slot.canvas.getBoundingClientRect();
        }
    }

    if (targetRect) {
        // Calculate position relative to the effects canvas for consistent positioning
        const finalX = targetRect.left - effectsCanvasRect.left + targetRect.width / 2;
        const finalY = targetRect.top - effectsCanvasRect.top + targetRect.height / 2;
        return {
            x: finalX,
            y: finalY
        };
    }

    return null;
}

function getAttackBarPosition() {
    const wrapper = document.getElementById('overall-game-wrapper');
    if (!wrapper) return null;
    const wrapperRect = wrapper.getBoundingClientRect();

    const attackBar = document.getElementById('attack-bar');
    if (!attackBar) return null;

    const attackBarRect = attackBar.getBoundingClientRect();
    
    return {
        x: attackBarRect.left - wrapperRect.left + attackBarRect.width / 2,
        y: attackBarRect.top - wrapperRect.top + attackBarRect.height / 2 
    };
}

export function startMatching() {
    // Clear main game board
    resetGame();
    // Clear effects
    clearAllEffects();
    // Clear player targets and flashes
    playerTargets.clear();
    targetAttackFlashes.clear();
    // Hide game end screen
    hideGameEndScreen();
    setSpectating(false); // NEW: Reset spectating state

    miniboardSlots.forEach(slot => {
        slot.userId = null;
        slot.dirty = true;
    }); // Clear miniboards
    socket.emit("matching");
}

let lastSentBoard = null;
function getBoardWithCurrentPiece(board, currentPiece) {
    const boardCopy = board.map(row => row.slice());
    if (currentPiece) {
        const shape = currentPiece.shape[currentPiece.rotation];
        shape.forEach(([dx, dy]) => {
            const x = currentPiece.x + dx;
            const y = currentPiece.y + dy;
            if (y >= 0 && y < boardCopy.length && x >= 0 && x < boardCopy[0].length) {
                boardCopy[y][x] = currentPiece.type;
            }
        });
    }
    return boardCopy;
}
function getBoardDiff(oldBoard, newBoard) {
    if (!oldBoard) return null;
    const diff = [];
    for (let r = 0; r < newBoard.length; r++) {
        for (let c = 0; c < newBoard[r].length; c++) {
            if (oldBoard[r][c] !== newBoard[r][c]) {
                diff.push({ r, c, val: newBoard[r][c] });
            }
        }
    }
    return diff.length > 0 ? diff : null;
}
export function sendBoardStatus(board, currentPiece) {
    if (!socket.connected) return;
    const currentBoardState = getBoardWithCurrentPiece(board, currentPiece);
    const diff = getBoardDiff(lastSentBoard, currentBoardState);
    if (diff) {
        socket.emit("BoardStatus", { diff });
        lastSentBoard = currentBoardState;
    } else if (!lastSentBoard) {
        socket.emit("BoardStatus", { board: currentBoardState });
        lastSentBoard = currentBoardState;
    }
}

function sendGarbage(targetId, lines) {
    if (!socket.connected || lines <= 0) return;
    socket.emit("SendGarbage", { targetId, lines });
}

export function setTarget(targetId) {
    if (!socket.connected) return;
    socket.emit('setTarget', targetId);
}

export function sendAttack(targetId, lines, clearedLines = null) {
    sendGarbage(targetId, lines);

    // Trigger the flash effect for the target line
    if (targetId) {

    }

    const myPos = getBoardCenterPosition(socket.id, clearedLines);
    let targetPos;

    if (targetId) {
        targetPos = getBoardCenterPosition(targetId);
    } else {
        // ターゲットがいない場合は、画面上部中央へ
        const effectCanvasElement = document.getElementById('effect-canvas');
        if (effectCanvasElement) {
            const effectCanvasRect = effectCanvasElement.getBoundingClientRect();
            targetPos = { x: effectCanvasRect.width / 2, y: 0 };
        }
    }

    createLightOrb(myPos, targetPos);
}

// NEW: Spectator functions
export function spectateRoom(roomId) {
    if (!socket.connected) return;
    socket.emit('spectateRoom', roomId);
}

export function requestPublicRooms() {
    if (!socket.connected) return;
    socket.emit('requestPublicRooms');
}

// NEW: Callbacks for spectator related events
let publicRoomsListCallback = null;
let spectateRoomInfoCallback = null;

export function setPublicRoomsListCallback(callback) {
    publicRoomsListCallback = callback;
}

export function setSpectateRoomInfoCallback(callback) {
    spectateRoomInfoCallback = callback;
}

let connectionError = false;
const errorOverlay = document.createElement('div');
errorOverlay.style.position = 'fixed';
errorOverlay.style.top = '0';
errorOverlay.style.left = '0';
errorOverlay.style.width = '100%';
errorOverlay.style.height = '100%';
errorOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
errorOverlay.style.color = 'white';
errorOverlay.style.display = 'none';
errorOverlay.style.justifyContent = 'center';
errorOverlay.style.alignItems = 'center';
errorOverlay.style.zIndex = '999';
errorOverlay.style.fontSize = '1.5rem';
errorOverlay.innerHTML = 'サーバーとの接続が切れました。再接続を試みています... <br>ページをリロードする必要があるかもしれません。';
document.body.appendChild(errorOverlay);
function showConnectionError() {
    connectionError = true;
    errorOverlay.style.display = 'flex';
}
function hideConnectionError() {
    connectionError = false;
    errorOverlay.style.display = 'none';
}
// Reconnection logic is handled in the initializeSocket function

// Function to connect to server (if not already connected)
export function connectToServer() {
    if (socket && !socket.connected) {
        socket.connect();
    }
}

export { connectionError, startAnimationIfNeeded, addOpponent, removeOpponent, updateSlotBoard };