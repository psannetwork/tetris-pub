import { CONFIG } from '../core/config.js';
import { tetrominoTypeToIndex } from '../engine/draw.js';
import { MAIN_BOARD_CELL_SIZE, BOARD_WIDTH, BOARD_HEIGHT, ATTACK_BAR_WIDTH, HOLD_BOX_WIDTH, NEXT_BOX_WIDTH, ATTACK_BAR_GAP, HOLD_BOX_GAP, NEXT_BOX_GAP, TOTAL_WIDTH } from '../ui/layout.js';
import { showCountdown, showGameEndScreen, hideGameEndScreen, setLastRatingUpdate } from '../ui/ui.js';
import { resetGame, setGameState, gameState, triggerGameOver, setGameClear, setHoldPiece, setNextPieces, initializePieces } from '../core/game.js';
import { addAttackBar } from '../core/garbage.js';
import { createLightOrb, triggerTargetAttackFlash, targetAttackFlashes, addTextEffect, clearAllEffects, triggerReceivedAttackEffect, startMiniboardEntryEffect, miniboardEntryEffects } from '../engine/effects.js'; // Added clearAllEffects and triggerReceivedAttackEffect
import { drawUI } from '../engine/draw.js';
import { setRoomDisplayState, hideMessage } from '../main.js'; // Import hideMessage

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

export function resetOnlineState() {
    currentCountdown = null;
    lastSentBoard = null;
    forceFullBoard = false;
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
        
        if (currentSocketId && currentSocketId !== socket.id) {
            myPastSocketIds.add(currentSocketId); 
        }
        currentSocketId = socket.id; 

        // 既存のログイン情報があれば再ログインを試みる（任意で追加可能）
    });

    socket.on('register_success', (data) => {
        if (authCallbacks.onRegisterSuccess) authCallbacks.onRegisterSuccess(data);
    });

    socket.on('register_error', (data) => {
        if (authCallbacks.onRegisterError) authCallbacks.onRegisterError(data);
    });

    socket.on('login_success', (data) => {
        if (authCallbacks.onLoginSuccess) authCallbacks.onLoginSuccess(data);
    });

    socket.on('login_error', (data) => {
        if (authCallbacks.onLoginError) authCallbacks.onLoginError(data);
    });

    socket.on('settings_updated', (data) => {
        if (authCallbacks.onSettingsUpdated) authCallbacks.onSettingsUpdated(data);
    });

    socket.on('rating_update', (data) => {
        addTextEffect(`${data.change >= 0 ? '+' : ''}${data.change} RATE`, { style: 'milestone', duration: 2000 });
        setLastRatingUpdate(data);
        if (authCallbacks.onRatingUpdate) authCallbacks.onRatingUpdate(data);
    });

    socket.on('targetsUpdate', (targets) => {

            playerTargets = new Map(targets);

            // We need to redraw the miniboards to update their target styles

        });

    

                                socket.on("roomInfo", (data) => {
                                    setCurrentRoomId(data.roomId); 

                            clearAllEffects(); 

                            const currentOpponents = new Set(miniboardSlots.filter(s => s.userId).map(s => s.userId));
                            
                            // メンバーがオブジェクト配列（{id, displayName...}）であることを考慮してIDを抽出
                            const memberIds = data.members.map(m => typeof m === 'object' ? m.id : m);
                            const newOpponentIds = new Set(memberIds.filter(id => id !== socket.id));

                        // Add new opponents
                        newOpponentIds.forEach(id => {
                            if (!currentOpponents.has(id)) addOpponent(id);
                        });

                        // Remove disconnected opponents
                        currentOpponents.forEach(id => {
                            if (!newOpponentIds.has(id)) removeOpponent(id);
                        });

                        // Only set gameState to ROOM_LOBBY if we are in LOBBY state
                        // Don't interrupt PLAYING or SPECTATING states
                        if (gameState === 'LOBBY') {
                            setGameState('ROOM_LOBBY');
                        }

                        // Update UI with room info
                        setRoomDisplayState(true, data.hostId === socket.id, data.roomId, data.members, data.isPrivate);
                    });

    

                socket.on("StartGame", () => {
                    currentCountdown = null;
                    showCountdown(null);
                    hideGameEndScreen(); 
                    resetGame(); 
                    initializePieces(); 
                    setHoldPiece(null); 
                    drawUI();           
                    setGameState('PLAYING');

                    // Record total players at start
                    const activeOpponentsCount = miniboardSlots.filter(s => s.userId).length;
                    totalPlayersAtStart = activeOpponentsCount + 1;

                    if (closeMenuCallback) {
                        closeMenuCallback();
                    }

            // Reset ALL slots for the new game
            miniboardSlots.forEach(slot => {
                slot.isGameOver = false;
                slot.boardState.forEach(row => row.fill(0));
                slot.dirty = true; // Mark all as dirty to clear visuals
            });

            finalRanking = {}; 
            finalStatsMap = {}; // Reset for new game

            lastSentBoard = null; // Ensure board history is cleared for the new game
            requestMiniboardRedraw();

        });

    

                        socket.on("ranking", (data) => {
                            const { finalRankMap, statsMap, roomId, isGameOver } = data;

                            if (roomId !== getCurrentRoomId()) return;

                            // Update the current player's ranking with the new data
                            if (finalRankMap) {
                                Object.assign(finalRanking, finalRankMap);
                            }

                            // Update stats map
                            if (statsMap) {
                                Object.assign(finalStatsMap, statsMap);
                            }

                            // Mark miniboards as game over when their rank is determined (rank > 1)
                            miniboardSlots.forEach(slot => {
                                if (slot.userId && finalRanking.hasOwnProperty(slot.userId) && finalRanking[slot.userId] > 1 && !slot.isGameOver) {
                                    slot.isGameOver = true;
                                    slot.dirty = true; // Ensure redraw for KO
                                }
                            });

                            const myRank = finalRanking[socket.id];

                            // If game is over, show the final results
                            if (isGameOver) {
                                setGameState('GAME_OVER');
                                const isWin = myRank === 1;
                                const title = isWin ? 'You Win!' : 'Game Over';
                                if (isWin) setGameClear(true);
                                showGameEndScreen(title, isWin, finalRanking, socket.id, finalStatsMap || {});
                            } else {
                                // If local player is eliminated, show results early
                                const amKnockedOut = myRank && myRank > 1;
                                if (amKnockedOut) {
                                    setGameState('GAME_OVER');
                                    showGameEndScreen('Game Over', false, finalRanking, socket.id, finalStatsMap || {});
                                } else {
                                    setGameState('PLAYING');
                                }
                            }
                            requestMiniboardRedraw();
                        });

    

            

    

                socket.on("YouWin", () => {

    

                    setGameState('GAME_OVER');

    

                    showGameEndScreen('You Win!', true, finalRanking, socket.id, finalStatsMap || {});

    

                });

    

            

    

                socket.on("GameOver", () => {

    

                    setGameState('GAME_OVER');

    

                    showGameEndScreen('Game Over', false, finalRanking, socket.id, finalStatsMap || {});

    

                });

    

                /* Individual BoardStatus is now handled by BoardStatusBulk
                socket.on("BoardStatus", (data) => {
                    ...
                });
                */

    

                socket.on("BoardStatusBulk", (updates) => {
                    if (gameState !== 'PLAYING' && gameState !== 'SPECTATING') return; 

            for (const userId in updates) {
                const boardData = updates[userId];
                if (!boardData) continue;

                if (isSpectating && userId === socket.id) continue;

                let slot = userIdToSlotMap.get(userId);
                if (!slot) {
                    if (userId !== socket.id) {
                        addOpponent(userId);
                        slot = userIdToSlotMap.get(userId);
                    }
                }
                
                if (slot) {
                    // If this player is already marked as game over in our ranking data,
                    // ensure the slot reflects that and don't overwrite with normal board data.
                    if (finalRanking.hasOwnProperty(userId) && finalRanking[userId] > 1) {
                        if (!slot.isGameOver) {
                            slot.isGameOver = true;
                            slot.dirty = true;
                        }
                    }
                    
                    const actualBoard = boardData.board || boardData;
                    updateSlotBoard(slot, actualBoard, boardData.diff);
                }
            }
            requestMiniboardRedraw();
        });

    

        socket.on("PlayerDisconnected", ({ userId }) => {

            removeOpponent(userId);

        });

    

        socket.on("CountDown", (count) => {

            currentCountdown = count;

            showCountdown(count);
            requestMiniboardRedraw();

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

            

                                            

            

                                                                                                                                                                        // NEW: Handle request for full board update when a new spectator joins

            

                                            

            

                                                                                                                                                                        socket.on('NewSpectator', () => {

            

                                            

            

                                                                                                                                                                            forceFullBoard = true;

            

                                            

            

                                                                                                                                                                        });

            

                                            

            

                                                                                                                

            

                                            

            

                                                        

            

                                            

            

                                                                    // NEW: matching handler for timeout/lobby return

            

                                            

            

                                                                                // NEW: matching handler for timeout/lobby return

            

                                            

            

                                                                                                                                                                socket.on('matching', () => {

            

                                            

            

                                                                                

            

                                            

            

                                                                                                                                                                    console.log("サーバーからの指示でロビーに戻ります");

            

                                            

            

                                                                                

            

                                            

            

                                                                                                                                                                    hideMessage(); // Clear any persistent messages

            

                                            

            

                                                                                

            

                                            

            

                                                                                                                                                                    resetOnlineState(); // NEW: Reset online state (countdown, etc.)

            

                                            

            

                                                                                

            

                                            

            

                                                                                                                                                                    setGameState('LOBBY');

            

                                            

            

                                                                                

            

                                            

            

                                                                                                                                                                    resetGame();

            

                                            

            

                                                                                

            

                                            

            

                                                                                                                                                                    setRoomDisplayState(false); // Go back to main lobby view

            

                                            

            

                                                                                

            

                                            

            

                                                                                                                                                                    hideGameEndScreen();

            

                                            

            

                                                                                

            

                                            

            

                                                                                                                                                                    hideConnectionError();

            

                                            

            

                                                                                                                                                                    

            

                                            

            

                                                                                                                                                                    // Force a UI redraw to clear any remaining text

            

                                            

            

                                                                                                                                                                    drawUI();

            

                                            

            

                                                                                

            

                                            

            

                                                                                                                                                                    // Ensure spectating is turned off

            

                                            

            

                                                                                

            

                                            

            

                                                                                                                                                                    setSpectating(false);

            

                                            

            

                                                                                

            

                                            

            

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
const userIdToSlotMap = new Map(); // New: Fast lookup for slots
const leftMiniboardsGroup = document.getElementById('left-miniboards-group');
const rightMiniboardsGroup = document.getElementById('right-miniboards-group');
const leftMiniboardsCanvas = document.getElementById('left-miniboards-canvas');
const rightMiniboardsCanvas = document.getElementById('right-miniboards-canvas');

export let MINIBOARD_CELL_SIZE;
export let MINIBOARD_WIDTH;
export let MINIBOARD_HEIGHT;
const MINIBOARD_GAP = 5;
const MINIBOARDS_PER_SIDE = 49;
const MINIBOARDS_PER_ROW = 7;

function setupMiniboardDimensions() {
    MINIBOARD_CELL_SIZE = 3.5; 
    MINIBOARD_WIDTH = 35; // 10 columns * 3.5
    MINIBOARD_HEIGHT = 80.5; // Match original grid row height
}

setupMiniboardDimensions();

function setupMiniboardSlots() {
    miniboardSlots.length = 0;
    
    // Setup Left Canvas
    if (leftMiniboardsCanvas) {
        leftMiniboardsCanvas.width = 275;
        leftMiniboardsCanvas.height = 593.5;
    }
    
    // Setup Right Canvas
    if (rightMiniboardsCanvas) {
        rightMiniboardsCanvas.width = 275;
        rightMiniboardsCanvas.height = 593.5;
    }

    const totalMiniboards = 98;
    for (let i = 0; i < totalMiniboards; i++) {
        const isLeft = i < 49;
        const sideIndex = isLeft ? i : i - 49;
        const row = Math.floor(sideIndex / MINIBOARDS_PER_ROW);
        const col = sideIndex % MINIBOARDS_PER_ROW;
        
        const x = col * (MINIBOARD_WIDTH + MINIBOARD_GAP);
        const y = row * (MINIBOARD_HEIGHT + MINIBOARD_GAP);

        const slot = {
            userId: null,
            boardState: Array.from({ length: CONFIG.board.rows }, () => Array(CONFIG.board.cols).fill(0)),
            isGameOver: false,
            canvas: isLeft ? leftMiniboardsCanvas : rightMiniboardsCanvas,
            ctx: isLeft ? leftMiniboardsCanvas.getContext('2d') : rightMiniboardsCanvas.getContext('2d'),
            x,
            y,
            isNew: false,
            dirty: true, // New: track if redraw is needed
            effect: null
        };

        miniboardSlots.push(slot);
    }
    
    // Handle clicks on consolidated canvases
    const handleCanvasClick = (event, isLeft) => {
        const canvas = isLeft ? leftMiniboardsCanvas : rightMiniboardsCanvas;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const clickX = (event.clientX - rect.left) * scaleX;
        const clickY = (event.clientY - rect.top) * scaleY;
        
        const startIndex = isLeft ? 0 : 49;
        for (let i = startIndex; i < startIndex + 49; i++) {
            const slot = miniboardSlots[i];
            if (slot.userId && 
                clickX >= slot.x && clickX <= slot.x + MINIBOARD_WIDTH &&
                clickY >= slot.y && clickY <= slot.y + MINIBOARD_HEIGHT) {
                if (gameState === 'PLAYING') {
                    setTarget(slot.userId);
                }
                break;
            }
        }
    };

    if (leftMiniboardsCanvas) {
        leftMiniboardsCanvas.onclick = (e) => handleCanvasClick(e, true);
    }
    if (rightMiniboardsCanvas) {
        rightMiniboardsCanvas.onclick = (e) => handleCanvasClick(e, false);
    }
}

window.addEventListener('load', setupMiniboardSlots);

function addOpponent(userId) {
    if (userId === socket.id) return;
    if (myPastSocketIds.has(userId)) return;
    if (userIdToSlotMap.has(userId)) return;

    const emptySlots = miniboardSlots.filter(slot => slot.userId === null);
    if (emptySlots.length > 0) {
        const randomIndex = Math.floor(Math.random() * emptySlots.length);
        const emptySlot = emptySlots[randomIndex];

        emptySlot.userId = userId;
        userIdToSlotMap.set(userId, emptySlot); // Add to map
        emptySlot.isGameOver = false;
        for (let r = 0; r < emptySlot.boardState.length; r++) {
            emptySlot.boardState[r].fill(0);
        }
        emptySlot.isNew = true;

        const pos = getBoardCenterPosition(userId);
        if (pos) {
            startMiniboardEntryEffect(userId, pos.x - MINIBOARD_WIDTH / 2, pos.y - MINIBOARD_HEIGHT / 2, MINIBOARD_WIDTH, MINIBOARD_HEIGHT);
        }
        requestMiniboardRedraw();
    }
}

function removeOpponent(userId) {
    const slot = userIdToSlotMap.get(userId);
    if (slot) {
        slot.userId = null;
        userIdToSlotMap.delete(userId); // Remove from map
        slot.dirty = true;
        requestMiniboardRedraw();
    }
}

function updateSlotBoard(slot, boardData, diffData) {
    try {
        // If the slot is already in Game Over state, don't update its board state with normal data,
        // just make sure it's marked for redrawing the KO screen if needed.
        if (slot.isGameOver) {
            slot.dirty = true;
            return;
        }

        if (boardData) {
            if (Array.isArray(boardData)) {
                slot.boardState = boardData;
                slot.dirty = true; // Mark as dirty
                requestMiniboardRedraw();
            }
        } else if (diffData && Array.isArray(diffData)) {
            if (!slot.boardState || !Array.isArray(slot.boardState) || slot.boardState.length === 0) {
                return;
            }
            let hasChanges = false;
            for (let i = 0; i < diffData.length; i++) {
                const diff = diffData[i];
                if (diff && typeof diff.r === 'number' && typeof diff.c === 'number') {
                    const { r, c, val } = diff;
                    if (slot.boardState[r] && slot.boardState[r][c] !== val) {
                        slot.boardState[r][c] = val;
                        hasChanges = true;
                    }
                }
            }
            if (hasChanges) {
                slot.dirty = true; // Mark as dirty
                requestMiniboardRedraw();
            }
        }
    } catch (e) {
        console.error("Error updating slot board:", e);
    }
}

function drawMiniBoard(slot) {
    if (!slot.dirty) return; 
    const { ctx, boardState, isGameOver, userId, isNew, x, y } = slot; 
    if (!slot || !ctx) return;

    ctx.clearRect(x, y, MINIBOARD_WIDTH, MINIBOARD_HEIGHT);

    // Show KO regardless of whether the user is still in the room
    if (isGameOver) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
        ctx.fillRect(x, y, MINIBOARD_WIDTH, MINIBOARD_HEIGHT);
        ctx.fillStyle = '#ff0055';
        ctx.font = `bold ${MINIBOARD_WIDTH / 1.5}px ${CONFIG.ui.fontFamily}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("KO", x + MINIBOARD_WIDTH / 2, y + MINIBOARD_HEIGHT / 2);
        slot.dirty = false;
        return;
    }

    if (userId === null) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.fillRect(x, y, MINIBOARD_WIDTH, MINIBOARD_HEIGHT);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.strokeRect(x + 0.5, y + 0.5, MINIBOARD_WIDTH - 1, MINIBOARD_HEIGHT - 1);
        slot.dirty = false;
        return;
    }

    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(x, y, MINIBOARD_WIDTH, MINIBOARD_HEIGHT);

    const startRow = CONFIG.board.rows - CONFIG.board.visibleRows;
    const visibleRows = CONFIG.board.visibleRows;
    const cols = CONFIG.board.cols;

    for (let r = 0; r < visibleRows; r++) {
        const boardRow = boardState[startRow + r];
        if (!boardRow) continue;

        for (let c = 0; c < cols; c++) {
            const block = boardRow[c];
            if (block === 0) continue;

            const bx = x + (c * MINIBOARD_CELL_SIZE);
            const by = y + (r * MINIBOARD_CELL_SIZE);

            if (block === 'G') {
                ctx.fillStyle = '#222';
                ctx.fillRect(bx, by, MINIBOARD_CELL_SIZE, MINIBOARD_CELL_SIZE);
                ctx.fillStyle = CONFIG.colors.garbage;
                ctx.fillRect(bx + MINIBOARD_CELL_SIZE * 0.15, by + MINIBOARD_CELL_SIZE * 0.15, MINIBOARD_CELL_SIZE * 0.7, MINIBOARD_CELL_SIZE * 0.7);
            } else {
                const typeIndex = tetrominoTypeToIndex(block);
                ctx.fillStyle = CONFIG.colors.tetromino[typeIndex + 1] || "#808080";
                ctx.fillRect(bx, by, MINIBOARD_CELL_SIZE, MINIBOARD_CELL_SIZE);
            }
        }
    }

    if (isNew || (!isSpectating && gameState !== 'PLAYING' && gameState !== 'GAME_OVER')) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(x, y, MINIBOARD_WIDTH, MINIBOARD_HEIGHT);
    }
    
    slot.dirty = false; // Reset dirty flag after drawing
}

export function drawAllMiniBoards() {
    // We don't clear the whole canvas anymore! 
    // Each dirty slot clears its own area in drawMiniBoard.
    for (const slot of miniboardSlots) {
        drawMiniBoard(slot);
    }
}

let redrawRequested = false;

export function requestMiniboardRedraw() {
    redrawRequested = true;
}

export function processMiniboardRedrawRequest() {
    if (redrawRequested) {
        drawAllMiniBoards();
        redrawRequested = false;
    }
}

function startAnimationIfNeeded() {
    // This function is now obsolete.
}

export let finalRanking = {}; 
export let finalStatsMap = {}; 
export let totalPlayersAtStart = 0; // New: Track starting player count
let currentRoomId = null; 

export function resetRankingData() {
    finalRanking = {};
    finalStatsMap = {};
}

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
    const effectsCanvas = document.getElementById('effect-canvas');
    if (!effectsCanvas) return null;

    const effectsCanvasRect = effectsCanvas.getBoundingClientRect();

    if (userId === socket.id) {
        const mainBoard = document.getElementById('main-game-board');
        if (!mainBoard) return null;
        const targetRect = mainBoard.getBoundingClientRect();
        return {
            x: targetRect.left - effectsCanvasRect.left + targetRect.width / 2,
            y: targetRect.top - effectsCanvasRect.top + targetRect.height / 2
        };
    } else {
        const slot = userIdToSlotMap.get(userId);
        if (slot && slot.canvas) {
            // Get the bounding rect of the consolidated canvas (left or right)
            const canvasRect = slot.canvas.getBoundingClientRect();
            
            // The slot's x and y are relative to its own consolidated canvas
            // We need to convert this to be relative to the effects canvas
            const slotCenterX = slot.x + MINIBOARD_WIDTH / 2;
            const slotCenterY = slot.y + MINIBOARD_HEIGHT / 2;
            
            // Final position = (Canvas screen pos - EffectsCanvas screen pos) + (Slot relative pos)
            return {
                x: (canvasRect.left - effectsCanvasRect.left) + slotCenterX,
                y: (canvasRect.top - effectsCanvasRect.top) + slotCenterY
            };
        }
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

// --- Auth & Settings Callbacks ---
let authCallbacks = {};
export function setAuthCallbacks(callbacks) {
    authCallbacks = { ...authCallbacks, ...callbacks };
}

export function register(username, password, nickname) {
    socket.emit('register', { username, password, nickname });
}

export function login(username, password) {
    socket.emit('login', { username, password });
}

export function updateSettings(nickname) {
    socket.emit('update_settings', { nickname });
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
        slot.isGameOver = false;
        slot.boardState.forEach(row => row.fill(0));
    }); // Clear miniboards
    socket.emit("matching");
}

let lastSentBoard = null;
let lastBoardUpdateTime = 0;
let lastFullSyncTime = 0; // New: Track last full sync
const BOARD_UPDATE_INTERVAL = 1000 / 15; // Max 15 updates per second
const FULL_SYNC_INTERVAL = 5000; // Force full sync every 5 seconds

function getBoardWithCurrentPiece(board, currentPiece) {
    if (!board || !Array.isArray(board)) return null;
    try {
        const boardCopy = board.map(row => Array.isArray(row) ? row.slice() : []);
        if (currentPiece && Array.isArray(currentPiece.shape) && currentPiece.shape[currentPiece.rotation]) {
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
    } catch (e) {
        console.error("Error in getBoardWithCurrentPiece:", e);
        return null;
    }
}

function getBoardDiff(oldBoard, newBoard) {
    if (!oldBoard || !newBoard) return null;
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

let forceFullBoard = false; // Flag to force full board update

export function sendBoardStatus(board, currentPiece) {
    if (!socket.connected) return;
    
    const now = Date.now();
    
    // Check if it's time for a periodic full sync
    if (now - lastFullSyncTime > FULL_SYNC_INTERVAL) {
        forceFullBoard = true;
    }

    if (now - lastBoardUpdateTime < BOARD_UPDATE_INTERVAL && !forceFullBoard) {
        return;
    }

    const currentBoardState = getBoardWithCurrentPiece(board, currentPiece);
    if (!currentBoardState) return;
    
    // Check if we need to force a full update or if it's the first update
    if (forceFullBoard || !lastSentBoard) {
        socket.emit("BoardStatus", { board: currentBoardState });
        lastSentBoard = currentBoardState;
        forceFullBoard = false; 
        lastBoardUpdateTime = now;
        lastFullSyncTime = now; // Update sync time
    } else {
        // Try to send diff
        const diff = getBoardDiff(lastSentBoard, currentBoardState);
        if (diff) {
            socket.emit("BoardStatus", { diff });
            lastSentBoard = currentBoardState;
            lastBoardUpdateTime = now;
        }
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