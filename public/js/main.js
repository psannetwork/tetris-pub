import { setGameGetStatsCallback } from './core/game.js';
import { setOnlineGetStatsCallback, setCloseMenuCallback, setRoomClosedCallback, initializeSocket, setUIMessageCallback } from './network/online.js';
import { CONFIG } from './core/config.js';
import { 
    gameState, setGameState, resetGame,
    currentPiece, level, isValidPosition, lockPiece, movePiece, LOCK_DELAY,
    board, score, linesCleared
} from './core/game.js';
import { drawGame, drawUI, setupCanvases } from './engine/draw.js';
import { updateEffects, initEffects, startTimeoutEffect, drawMiniboardEntryEffects, clearAllEffects, drawAllEffects, effectsCtx } from './engine/effects.js';
import { handleInput } from './engine/input.js';
import { sendBoardStatus, connectToServer, startMatching, currentCountdown, drawAllMiniBoards, startAnimationIfNeeded, socket, setManualDisconnect, setAutoMatchOnReconnect, setCurrentRoomId, getCurrentRoomId, isSpectating, setSpectating, spectateRoom, requestPublicRooms, setPublicRoomsListCallback, setSpectateRoomInfoCallback, miniboardSlots, addOpponent, removeOpponent, drawTargetLines, finalRanking, finalStatsMap, resetRankingData, processMiniboardRedrawRequest, resetOnlineState } from './network/online.js';
import { showCountdown } from './ui/ui.js';

// --- DOM Elements (Declared as let, assigned in init) ---
let lobbyOverlay;
let mainMenuButtons;
let joinPublicMatchButton;
let createRoomButton;
let joinRoomButton;

let createRoomModal;
let joinRoomModal;
let adminMenuModal;
let closeModalButtons;

let confirmCreateRoomButton;
let createRoomPasswordInput;

let confirmJoinRoomButton;
let joinRoomIdInput;
let joinRoomPasswordInput;

let roomInfoDisplay;
let currentRoomIdDisplay;
let roomHostStatusDisplay;
let hostStartGameButton;
let currentRoomIsPrivate = false; 

// NEW: Strict App State Management
const appState = {
    inRoom: false,
    isHost: false,
    isPrivate: false,
    roomId: null,
    isSpectating: false
};

function resetAppState() {
    appState.inRoom = false;
    appState.isHost = false;
    appState.isPrivate = false;
    appState.roomId = null;
    appState.isSpectating = false;
    currentRoomIsPrivate = false;
    hideMessage();
    resetRankingData();
    resetOnlineState(); // NEW: Reset network-related state
}

let menuButton;
let adminRoomIdDisplay;
let adminStartGameButton;
let memberListUl;
let finalRankingList; 
let gameEndTitle;     

let messageDisplay;
let gameEndOverlay;
let retryButton;
let lobbyButton;

// NEW: Spectator related variables
let spectateButton;
let joinPublicSpectateButton;
let spectateRoomsModal;
let publicRoomsList;
let noPublicRoomsMessage;
let spectatorMenuModal;
let spectatorBackToLobbyButton;
let spectatorRankingList;

// --- Stats State ---
let lastTime = 0;
let dropCounter = 0;
let gameStartTime = 0;
let keyPresses = 0;
let piecesPlaced = 0;
let pps = '0.00';
let apm = '0.0';
let time = '00:00';

// --- Function to close menu when game starts ---
function closeMenuWhenGameStarts() {
    if (lobbyOverlay) {
        lobbyOverlay.classList.add('hidden');
    }
    if (mainMenuButtons) {
        mainMenuButtons.style.display = 'none';
    }
    // Also hide room info if it's still showing the start button
    if (hostStartGameButton) {
        setButtonState(hostStartGameButton, false);
    }
    if (adminStartGameButton) {
        setButtonState(adminStartGameButton, false);
    }
    if (menuButton) {
        // menuButton.style.display = 'none'; // Keep menu button
    }
}

// --- Function to handle room closure ---
function handleRoomClosed() {
    setGameState('LOBBY');
    resetGame();
    setSpectating(false); 
    resetAppState(); // Ensure clean state
    setRoomDisplayState(false); 
    updateButtonStates();
    showMessage({ type: 'error', message: 'ルームがホストによって閉鎖されました。' });
}



// --- Helper function to set button state ---
function setButtonState(button, enabled) {
    if (!button) return; 
    button.disabled = !enabled;
    if (enabled) {
        button.classList.remove('disabled');
    } else {
        button.classList.add('disabled');
    }
}

// --- Message Display Function ---
let messageTimeout;
let hideTransitionTimeout; // New: Track transition timeout

export function hideMessage() {
    clearTimeout(messageTimeout);
    clearTimeout(hideTransitionTimeout);
    if (messageDisplay) {
        messageDisplay.classList.remove('show');
        messageDisplay.style.display = 'none';
    }
}

function showMessage({ type, message, data }) { 
    clearTimeout(messageTimeout);
    clearTimeout(hideTransitionTimeout);

    if (messageDisplay) { 
        messageDisplay.textContent = message;
        messageDisplay.className = ''; 
        messageDisplay.style.display = 'block';
        void messageDisplay.offsetWidth; 
        messageDisplay.classList.add('show', type);

        if (type === 'timeout') { 
            startTimeoutEffect(message);
        } else if (type === 'publicRoomsList' && data) { 
            populatePublicRoomsList(data);
            openModal(spectateRoomsModal);
        }

        let duration = type === 'error' ? 5000 : (type === 'success' ? 2000 : 3000);

        messageTimeout = setTimeout(() => {
            messageDisplay.classList.remove('show');
            hideTransitionTimeout = setTimeout(() => {
                 if (!messageDisplay.classList.contains('show')) {
                     messageDisplay.style.display = 'none';
                 }
            }, 500); 
        }, duration);
    }
}

// --- UI Display State Management ---
export function setRoomDisplayState(inRoom, isHost = false, roomId = null, members = [], isPrivate = false) { 
    // Update appState flags
    appState.inRoom = inRoom;
    appState.isHost = isHost;
    appState.isPrivate = isPrivate;
    appState.roomId = roomId;
    currentRoomIsPrivate = isPrivate;

    if (inRoom) {
        lobbyOverlay.classList.add('hidden');
        mainMenuButtons.style.display = 'none';
        roomInfoDisplay.style.display = 'block';
        currentRoomIdDisplay.textContent = roomId;
        adminRoomIdDisplay.textContent = roomId; 

        if (isHost && !isSpectating) { 
            roomHostStatusDisplay.textContent = '(ホスト)';
            hostStartGameButton.style.display = 'block';
        } else {
            roomHostStatusDisplay.textContent = '';
            hostStartGameButton.style.display = 'none';
        }

        // Hamburger button is always shown now
        if (menuButton) {
             menuButton.style.display = 'flex';
        }
        
        // Adjust display of game-related panels based on whether spectating
        if (isSpectating) {
            document.getElementById('game-left-panel').style.display = 'block'; 
            document.getElementById('game-right-panel').style.display = 'block'; 
            document.getElementById('attack-bar').style.display = 'none'; 
        } else {
            document.getElementById('game-left-panel').style.display = 'block';
            document.getElementById('game-right-panel').style.display = 'block';
            document.getElementById('attack-bar').style.display = 'block';
        }

        // Populate member list in admin modal (only if not spectating and host)
        if (memberListUl && !isSpectating) { 
            memberListUl.innerHTML = '';
            members.forEach(memberId => {
                const li = document.createElement('li');
                li.textContent = memberId;
                if (isHost && memberId !== socket.id) {
                    const kickButton = document.createElement('button');
                    kickButton.textContent = 'キック';
                    kickButton.classList.add('kick-button');
                    kickButton.dataset.playerId = memberId;
                    kickButton.onclick = () => {
                        socket.emit('kickPlayer', { playerIdToKick: memberId });
                    };
                    li.appendChild(kickButton);
                } else if (memberId === socket.id) {
                    li.innerHTML = `<span>${memberId} (あなた)</span>`;
                }
                memberListUl.appendChild(li);
            });
        }


    } else { // Not in a room, show lobby main menu
        lobbyOverlay.classList.remove('hidden');
        mainMenuButtons.style.display = 'block';
        roomInfoDisplay.style.display = 'none';
        hostStartGameButton.style.display = 'none';
        // if (menuButton) menuButton.style.display = 'none'; // Keep menu button visible
        setCurrentRoomId(null);
        setSpectating(false); 
        appState.isSpectating = false;
        
        document.getElementById('game-left-panel').style.display = 'block';
        document.getElementById('game-right-panel').style.display = 'block';
        document.getElementById('attack-bar').style.display = 'block';
    }
}

// --- Modal Functions ---
function openModal(modal) {
    if (!modal) return; // Guard against null modal
    modal.style.display = 'block';
    mainMenuButtons.style.display = 'none';
    roomInfoDisplay.style.display = 'none'; // Also hide room info if showing
    if (menuButton) { // NEW: Check if element exists
        menuButton.style.display = 'none'; // Hide hamburger when other modals open
    }
    if (isSpectating) { // NEW: hide game-related elements if spectating
        document.getElementById('game-left-panel').style.display = 'none';
        document.getElementById('game-right-panel').style.display = 'none';
        document.getElementById('attack-bar').style.display = 'none';
        document.getElementById('main-game-board').style.display = 'none';
    }
}

function closeModal(modal) {
    if (!modal) return; // Guard against null modal
    modal.style.display = 'none';

    // Re-evaluate UI state after closing a modal
    if (getCurrentRoomId()) {
        // If we are in a room, request fresh room info to redraw the UI correctly.
        // This will show the menu button again if needed.
        socket.emit('requestRoomInfo');
    } else {
        // If not in a room, we are in the lobby. Show main menu.
        mainMenuButtons.style.display = 'block';
        roomInfoDisplay.style.display = 'none';
    }

    // Restore game board visibility if it was hidden (e.g., for spectator modal)
    document.getElementById('main-game-board').style.display = 'block';
    if (!isSpectating) {
        document.getElementById('game-left-panel').style.display = 'block';
        document.getElementById('game-right-panel').style.display = 'block';
        document.getElementById('attack-bar').style.display = 'block';
    }


    // Clear inputs when closing specific modals
    if (modal.id === 'create-room-modal' && createRoomPasswordInput) {
        createRoomPasswordInput.value = '';
    } else if (modal.id === 'join-room-modal' && joinRoomIdInput && joinRoomPasswordInput) {
        joinRoomIdInput.value = '';
        joinRoomPasswordInput.value = '';
    }

    // Clear spectator rooms list when closing that modal
    if (modal.id === 'spectate-rooms-modal' && publicRoomsList && noPublicRoomsMessage) {
        publicRoomsList.innerHTML = '';
        noPublicRoomsMessage.style.display = 'none';
    }
}


// --- Game Loop ---
function update(now = performance.now()) {
    // If spectating, do not run player-specific game logic
    if (gameState === 'PLAYING' && !isSpectating) { // NEW: Add !isSpectating
        if (gameStartTime === 0) {
            gameStartTime = now;
        }
        handleInput();

        const delta = now - lastTime;
        lastTime = now;

        dropCounter += delta;
        if (dropCounter > CONFIG.dropInterval / level) {
            movePiece({ x: 0, y: 1 });
            dropCounter = 0;
        }

        if (currentPiece && !isValidPosition(currentPiece, 0, 1)) {
            currentPiece.lockDelay += delta;
            if (currentPiece.lockDelay >= LOCK_DELAY) {
                lockPiece();
                piecesPlaced++; // Increment pieces placed on lock
            }
        }
        
        // updateEffects(); // REMOVED - now called once at the end
        sendBoardStatus(board, currentPiece);

        // Calculate stats
        const elapsedTime = (now - gameStartTime) / 1000;
        const minutes = Math.floor(elapsedTime / 60).toString().padStart(2, '0');
        const seconds = Math.floor(elapsedTime % 60).toString().padStart(2, '0');
        time = `${minutes}:${seconds}`;
        pps = (piecesPlaced / elapsedTime || 0).toFixed(2);
        apm = ((keyPresses * 60) / elapsedTime || 0).toFixed(1);

    } else if (gameState === 'SPECTATING') { // NEW: Handle spectating state
        // In spectating mode, only effects are updated and miniboards drawn
        // updateEffects(); // REMOVED - now called once at the end
        // Stats are reset as no active player game is running
        gameStartTime = 0;
        piecesPlaced = 0;
        keyPresses = 0;
    } else {
        // Reset stats when not playing (or spectating)
        gameStartTime = 0;
        piecesPlaced = 0;
        keyPresses = 0;
    }

    // Update button states based on game state
    updateButtonStates();

    // Drawing is now separated and happens every frame regardless of state
    updateEffects(); // Call updateEffects once before drawing all effects
    drawGame();
    drawUI();
    processMiniboardRedrawRequest(); // Draw miniboards only if requested
    drawAllEffects(); // Call drawAllEffects to render all effects
    
    // Draw target lines separately as it depends on spectator state
    if (effectsCtx && !isSpectating) {
        drawTargetLines(effectsCtx);
    }

    // drawAllEffects handles text, particles, orbs, and miniboard entry effects
    drawAllEffects(); 
    
    // Draw target lines separately as it depends on spectator state
    if (effectsCtx && !isSpectating) {
        drawTargetLines(effectsCtx);
    }

    // drawAllMiniBoards() is handled by its own animation system when needed
    startAnimationIfNeeded(); // Start miniboard animation when needed

    requestAnimationFrame(update);
}

// --- Function to update button states based on game state ---
function updateButtonStates() {
    const isHost = appState.isHost;
    const inRoom = appState.inRoom;

    if (gameState === 'LOBBY') {
        setButtonState(joinPublicMatchButton, true);
        setButtonState(retryButton, false);
        setButtonState(lobbyButton, false);
        setButtonState(spectateButton, false); 
        setButtonState(joinPublicSpectateButton, true); 
        setButtonState(hostStartGameButton, false);
        setButtonState(adminStartGameButton, false);
    } else if (gameState === 'PLAYING' && !isSpectating && !appState.isSpectating) { 
        setButtonState(joinPublicMatchButton, false);
        setButtonState(retryButton, false);
        setButtonState(lobbyButton, false);
        setButtonState(spectateButton, false); 
        setButtonState(joinPublicSpectateButton, false); 
        setButtonState(hostStartGameButton, false);
        setButtonState(adminStartGameButton, false);
    } else if (gameState === 'GAME_OVER' && !isSpectating && !appState.isSpectating) { 
        setButtonState(joinPublicMatchButton, false);
        setButtonState(retryButton, true);
        setButtonState(lobbyButton, true);
        setButtonState(spectateButton, true); 
        setButtonState(joinPublicSpectateButton, false); 
        
        // Host can still see start button if in a private room to restart
        setButtonState(hostStartGameButton, appState.isPrivate && isHost);
        setButtonState(adminStartGameButton, appState.isPrivate && isHost);

        if (retryButton) {
            retryButton.textContent = appState.isPrivate ? 'ルームに戻る' : 'Play Again';
        }
    } else if (gameState === 'SPECTATING' || isSpectating || appState.isSpectating) { 
        setButtonState(joinPublicMatchButton, false);
        setButtonState(retryButton, false); 
        setButtonState(lobbyButton, false);
        setButtonState(spectateButton, false); 
        setButtonState(joinPublicSpectateButton, false); 
        setButtonState(hostStartGameButton, false);
        setButtonState(adminStartGameButton, false);
    } else {
        // Handle intermediate states like ROOM_LOBBY
        setButtonState(joinPublicMatchButton, false);
        if (inRoom) {
            setButtonState(hostStartGameButton, isHost);
            setButtonState(adminStartGameButton, isHost);
            setButtonState(lobbyButton, true); 
        }
    }
}

// --- Initialization ---
function init() {
    // Assign DOM elements inside init()
    lobbyOverlay = document.getElementById('lobby-overlay');
    mainMenuButtons = document.getElementById('main-menu-buttons');
    joinPublicMatchButton = document.getElementById('join-public-match-button');
    createRoomButton = document.getElementById('create-room-button');
    joinRoomButton = document.getElementById('join-room-button');

    createRoomModal = document.getElementById('create-room-modal');
    joinRoomModal = document.getElementById('join-room-modal');
    adminMenuModal = document.getElementById('admin-menu-modal');
    closeModalButtons = document.querySelectorAll('.close-modal');

    confirmCreateRoomButton = document.getElementById('confirm-create-room');
    createRoomPasswordInput = document.getElementById('create-room-password');

    confirmJoinRoomButton = document.getElementById('confirm-join-room');
    joinRoomIdInput = document.getElementById('join-room-id');
    joinRoomPasswordInput = document.getElementById('join-room-password');

    roomInfoDisplay = document.getElementById('room-info-display');
    currentRoomIdDisplay = document.getElementById('current-room-id');
    roomHostStatusDisplay = document.getElementById('room-host-status');
    hostStartGameButton = document.getElementById('host-start-game-button');

    menuButton = document.getElementById('menu-button');
    adminRoomIdDisplay = document.getElementById('admin-room-id');
    adminStartGameButton = document.getElementById('admin-start-game-button'); // Ensure this is assigned
    memberListUl = document.getElementById('member-list');
    finalRankingList = document.getElementById('final-ranking-list'); // Assigned here
    gameEndTitle = document.getElementById('game-end-title');     // Assigned here
    const adminBackToLobbyButton = document.getElementById('admin-back-to-lobby-button'); // NEW

    // NEW: Spectator related DOM elements
    spectateButton = document.getElementById('spectate-button');
    joinPublicSpectateButton = document.getElementById('join-public-spectate-button');
    spectateRoomsModal = document.getElementById('spectate-rooms-modal');
    publicRoomsList = document.getElementById('public-rooms-list');
    noPublicRoomsMessage = document.getElementById('no-public-rooms-message');
    spectatorMenuModal = document.getElementById('spectator-menu-modal');
    spectatorRankingList = document.getElementById('spectator-ranking-list');
    spectatorBackToLobbyButton = document.getElementById('spectator-back-to-lobby-button');
    // END NEW

    messageDisplay = document.getElementById('message-display');
    gameEndOverlay = document.getElementById('game-end-overlay');
    retryButton = document.getElementById('retry-button');
    lobbyButton = document.getElementById('lobby-button');

    // NEW: Admin Start Game Button Logic
    if (adminStartGameButton) {
        adminStartGameButton.onclick = () => {
            socket.emit('startGame');
        };
    }

    // NEW: Admin Back to Lobby Button Logic
    if (adminBackToLobbyButton) {
        adminBackToLobbyButton.onclick = () => {
             closeModal(adminMenuModal);
             
             // Same logic as lobbyButton.onclick
             setManualDisconnect(true);
             setAutoMatchOnReconnect(false);
             if (socket) {
                 socket.disconnect();
             }
             if (gameEndOverlay) gameEndOverlay.classList.remove('visible');
             setGameState('LOBBY');
             resetGame();
             setRoomDisplayState(false); 
             
             // Update button states manually since we are forcing lobby state
             if (joinPublicMatchButton) setButtonState(joinPublicMatchButton, true);
             if (retryButton) setButtonState(retryButton, false);
             if (lobbyButton) setButtonState(lobbyButton, false);
             if (spectateButton) setButtonState(spectateButton, false);

             // Delay reconnection slightly to ensure disconnect events are processed
             setTimeout(() => {
                 initializeSocket();
                 connectToServer();
             }, 100);
        };
    }


    setGameGetStatsCallback(getStats);
    setOnlineGetStatsCallback(getStats);
    setupCanvases();
    // NEW: Initialize effects canvas
    const effectCanvas = document.getElementById('effect-canvas');
    if (effectCanvas) {
        initEffects(effectCanvas);
    }
    initializeSocket(); // Should be called once, connectToServer handles it
    gameEndOverlay.classList.remove('visible');
    setGameState('LOBBY');
    resetGame();
    lastTime = performance.now();
    update();
    updateButtonStates(); // Initial button state update
    // if (menuButton) menuButton.style.display = 'none'; // REMOVED: Always show menu button
    if (messageDisplay) messageDisplay.style.display = 'none'; // Ensure message display is hidden initially

    // Register the callback to close menu when game starts
    setCloseMenuCallback(closeMenuWhenGameStarts);

    // Register the callback for room closed event
    setRoomClosedCallback(handleRoomClosed);

    // NEW: Register the callback for uiMessage events
    setUIMessageCallback(showMessage);
    setPublicRoomsListCallback(populatePublicRoomsList); // NEW: Register public rooms list callback
    setSpectateRoomInfoCallback(handleSpectateRoomInfo); // NEW: Register spectate room info callback

    // --- Event Listeners ---
    if (joinPublicMatchButton) {
        joinPublicMatchButton.onclick = () => {
            // For public matches, hamburger button should not be shown. -> CHANGED: It SHOULD be shown now.
            setRoomDisplayState(true, false, null, [], false); // isHost=false, roomId=null, members=[], isPrivate=false
            startMatching();
            setButtonState(joinPublicMatchButton, false);
        };
    }

    if (createRoomButton) {
        createRoomButton.onclick = () => {
            openModal(createRoomModal);
        };
    }

    if (joinRoomButton) {
        joinRoomButton.onclick = () => {
            openModal(joinRoomModal);
        };
    }

    // NEW: Public Spectate Button
    if (joinPublicSpectateButton) {
        joinPublicSpectateButton.onclick = () => {
            requestPublicRooms(); // Request list of public rooms
            openModal(spectateRoomsModal);
        };
    }

    if (menuButton) {
        menuButton.onclick = () => {
            if (gameState === 'SPECTATING') {
                openModal(spectatorMenuModal);
                // Populate spectator ranking list if data is available
                if (finalRanking) {
                    displaySpectatorRanking(finalRanking, socket.id, finalStatsMap);
                }
            } else if (getCurrentRoomId()) {
                // Update Admin Menu content based on host status and private/public
                const isHost = roomHostStatusDisplay.textContent.includes('ホスト');
                
                if (adminStartGameButton) {
                     // Only show start button if private room AND host
                     adminStartGameButton.style.display = (currentRoomIsPrivate && isHost) ? 'block' : 'none';
                }
                
                const memberListTitle = document.getElementById('member-list-title');
                if (memberListTitle) {
                    memberListTitle.style.display = currentRoomIsPrivate ? 'block' : 'none';
                }
                
                if (memberListUl) {
                    memberListUl.style.display = currentRoomIsPrivate ? 'block' : 'none';
                }

                openModal(adminMenuModal);
            } else {
                // In Lobby
                if (lobbyOverlay.classList.contains('hidden')) {
                    lobbyOverlay.classList.remove('hidden');
                    setRoomDisplayState(false); // Ensure lobby state
                } else {
                    // If already in lobby menu, maybe show a help message or settings in future
                    showMessage({ type: 'info', message: 'ロビー画面です。' });
                }
            }
        };
    } else {
        console.error("Error: #menu-button element not found in the DOM. Cannot attach event listener.");
    }


    closeModalButtons.forEach(button => {
        if (button) {
            button.onclick = (event) => {
                const modal = event.target.closest('.modal');
                closeModal(modal);
            };
        }
    });

    if (confirmCreateRoomButton) {
        confirmCreateRoomButton.onclick = () => {
            const plainPassword = createRoomPasswordInput.value;
            socket.emit('createPrivateRoom', { plainPassword });
            closeModal(createRoomModal);
            // UI state will be handled by roomInfo event from server
        };
    }

    if (confirmJoinRoomButton) {
        confirmJoinRoomButton.onclick = () => {
            const roomId = joinRoomIdInput.value;
            const plainPassword = joinRoomPasswordInput.value;
            if (roomId) {
                socket.emit('joinPrivateRoom', { roomId, plainPassword });
                closeModal(joinRoomModal);
                // UI state will be handled by roomInfo event from server
            } else {
                showMessage({ type: 'error', message: 'ルームIDを入力してください。' });
            }
        };
    }

    if (hostStartGameButton) {
        hostStartGameButton.onclick = () => {
            console.log('🎮 Emitting startGame event from hostStartGameButton');
            socket.emit('startGame');
            // setButtonState(hostStartGameButton, false); // Removed to allow retry on error
        };
    } else {
        console.error('hostStartGameButton is null or undefined');
    }

    if (adminStartGameButton) {
        adminStartGameButton.onclick = () => { // New: Start game from admin menu
            console.log('🎮 Emitting startGame event from adminStartGameButton');
            socket.emit('startGame');
            // setButtonState(adminStartGameButton, false); // Removed to allow retry on error
        };
    } else {
        console.error('adminStartGameButton is null or undefined');
    }

    if (retryButton) {
        retryButton.onclick = () => {
            if (currentRoomIsPrivate) {
                // Private Room: Stay in the room, just close overlay and refresh info
                gameEndOverlay.classList.remove('visible');
                resetGame();
                // Reset local button states to "in room" state
                setButtonState(hostStartGameButton, roomHostStatusDisplay.textContent.includes('ホスト'));
                // Request fresh room info to update member list and UI
                socket.emit('requestRoomInfo');
            } else {
                // Public Match: Disconnect and find new match
                setManualDisconnect(true);
                setAutoMatchOnReconnect(true); // Do auto-match when retrying
                if (socket) {
                    socket.disconnect();
                }
                gameEndOverlay.classList.remove('visible');
                initializeSocket(); // Reinitialize socket to ensure clean state
                connectToServer(); // Reconnect will be handled by connect event in online.js
                setButtonState(retryButton, false);
                setButtonState(lobbyButton, false);
                setButtonState(spectateButton, false); // NEW
            }
        };
    }

    // NEW: Spectate Button on Game Over screen
    if (spectateButton) {
        spectateButton.onclick = () => {
            const currentId = getCurrentRoomId();
            if (currentId) {
                startSpectating(currentId);
                setButtonState(retryButton, false);
                setButtonState(lobbyButton, false);
                setButtonState(spectateButton, false);
            }
        };
    }

    if (lobbyButton) {
        lobbyButton.onclick = () => {
            setManualDisconnect(true);
            setAutoMatchOnReconnect(false); // Don't auto-match when going back to lobby
            if (socket) {
                socket.disconnect();
            }
            gameEndOverlay.classList.remove('visible');
            setGameState('LOBBY');
            resetGame();
            setRoomDisplayState(false); // Go back to main lobby view
            setButtonState(lobbyButton, false);
            setButtonState(retryButton, false);
            setButtonState(joinPublicMatchButton, true);
            setButtonState(spectateButton, false); // NEW
            // Reconnect the socket after disconnecting to allow new matching
            // Delay reconnection slightly to ensure disconnect events are processed
            setTimeout(() => {
                initializeSocket(); // Reinitialize socket to ensure clean state
                connectToServer();
            }, 100);
        };
    }

    // NEW: Spectator Back to Lobby Button
    if (spectatorBackToLobbyButton) {
        spectatorBackToLobbyButton.onclick = () => {
            setManualDisconnect(true);
            setAutoMatchOnReconnect(false);
            if (socket) {
                socket.disconnect();
            }
            closeModal(spectatorMenuModal);
            gameEndOverlay.classList.remove('visible'); // Hide game end overlay just in case
            setGameState('LOBBY');
            resetGame();
            setSpectating(false); // Clear spectating state
            setRoomDisplayState(false);

            // Explicitly set button states for the lobby
            setButtonState(lobbyButton, false);
            setButtonState(retryButton, false);
            setButtonState(joinPublicMatchButton, true);
            setButtonState(spectateButton, false);
            setButtonState(joinPublicSpectateButton, true);

            initializeSocket();
            connectToServer();
        };
    };


}

// --- Public Functions ---

export function incrementKeyPresses() {
    keyPresses++;
}

export function getStats() {
    return { 
        time,
        lines: linesCleared,
        level,
        score,
        apm,
        pps
    };
}

// NEW: startSpectating function
function startSpectating(roomId) {
    // Hide any visible overlays/modals
    if (gameEndOverlay) {
        gameEndOverlay.classList.remove('visible');
    }
    if (spectatorMenuModal) {
        spectatorMenuModal.style.display = 'none';
    }
    if (spectateRoomsModal) {
        spectateRoomsModal.style.display = 'none';
    }
    if (adminMenuModal) {
        adminMenuModal.style.display = 'none';
    }
    if (createRoomModal) {
        createRoomModal.style.display = 'none';
    }
    if (joinRoomModal) {
        joinRoomModal.style.display = 'none';
    }
    if (lobbyOverlay) {
        lobbyOverlay.style.display = 'none';
    }

    setGameState('SPECTATING');
    resetGame();
    // Don't clear effects when spectating - keep showing game effects
    setSpectating(true); // Set spectating state
    setRoomDisplayState(true, false, roomId, [], false); // Update UI for spectating
    spectateRoom(roomId); // Tell server to spectate
    updateButtonStates();
    // Hide main game elements not needed for spectating
    document.getElementById('main-game-board').style.display = 'block'; // Ensure board itself is visible
    document.getElementById('score-display').style.display = 'none'; // Hide score for player, show only opponent boards

    // Clear old ranking data
    resetRankingData();

    if (finalRankingList) { // Clear old ranking if any
        finalRankingList.innerHTML = '';
    }
}

// NEW: populatePublicRoomsList function
function populatePublicRoomsList(rooms) {
    publicRoomsList.innerHTML = '';
    if (rooms && rooms.length > 0) {
        noPublicRoomsMessage.style.display = 'none';
        rooms.forEach(room => {
            const li = document.createElement('li');
            li.innerHTML = `
                <span>ID: ${room.roomId}</span>
                <span>(${room.playersCount}人プレイ中)</span>
                <button class="join-spectate-room-button" data-room-id="${room.roomId}">観戦</button>
            `;
            const spectateBtn = li.querySelector('.join-spectate-room-button');
            if (spectateBtn) {
                spectateBtn.onclick = () => {
                    startSpectating(room.roomId);
                    closeModal(spectateRoomsModal);
                };
            }
            publicRoomsList.appendChild(li);
        });
    } else {
        noPublicRoomsMessage.style.display = 'block';
    }
}

// NEW: handleSpectateRoomInfo function
function handleSpectateRoomInfo(data) {
    setCurrentRoomId(data.roomId);
    setGameState('SPECTATING');
    setSpectating(true);
    setRoomDisplayState(true, false, data.roomId, [], false); // Host is always false for spectators
    clearAllEffects();
    resetGame(); // Clear client-side game state
    updateButtonStates();

    // Hide unnecessary game elements for spectators
    document.getElementById('main-game-board').style.display = 'block'; // Ensure board itself is visible
    document.getElementById('score-display').style.display = 'none'; // Hide score for player, show only opponent boards

    // Explicitly clear all miniboard slots before populating for the new spectated room
    miniboardSlots.forEach(slot => {
        slot.userId = null;
        slot.dirty = true;
        slot.boardState.forEach(row => row.fill(0)); // Also clear board state
        slot.isGameOver = false; // Reset game over status
    });
    // Now add opponents for the current room
    data.members.filter(id => id !== socket.id).forEach(id => addOpponent(id));
}

// NEW: displaySpectatorRanking function
function displaySpectatorRanking(ranking, myId, statsMap) {
    if (!spectatorRankingList) return;

    spectatorRankingList.innerHTML = ''; // Clear previous ranking

    // Sort players by rank (lower number is better)
    const sortedPlayers = Object.keys(ranking).sort((a, b) => {
        // Players still in game (rank null/undefined) go first
        if (!ranking[a] && ranking[b]) return -1;
        if (ranking[a] && !ranking[b]) return 1;
        if (!ranking[a] && !ranking[b]) return 0;
        return ranking[a] - ranking[b];
    });

    sortedPlayers.forEach(playerId => {
        const rank = ranking[playerId];
        const stats = statsMap[playerId];
        const listItem = document.createElement('div');
        listItem.classList.add('ranking-item');
        if (playerId === myId) {
            listItem.classList.add('self');
        }
        
        const rankText = rank ? `Rank: ${rank}` : 'プレイ中';
        const statsText = stats ? 
            `スコア: ${stats.score}, ライン: ${stats.lines}, レベル: ${stats.level}, 時間: ${stats.time}` : '';
        
        listItem.innerHTML = `
            <span>${playerId === myId ? '(あなた)' : playerId}</span>
            <span>${rankText}</span>
            <span>${statsText}</span>
        `;
        spectatorRankingList.appendChild(listItem);
    });
}

window.addEventListener('DOMContentLoaded', init);