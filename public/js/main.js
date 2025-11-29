import { setGameGetStatsCallback } from './game.js';
import { setOnlineGetStatsCallback } from './online.js';
import { CONFIG } from './config.js';
import { 
    gameState, setGameState, resetGame,
    currentPiece, level, isValidPosition, lockPiece, movePiece, LOCK_DELAY,
    board, score, linesCleared
} from './game.js';
import { drawGame, drawUI, setupCanvases } from './draw.js';
import { updateEffects, initEffects } from './effects.js';
import { handleInput } from './input.js';
import { sendBoardStatus, connectToServer, startMatching, currentCountdown, startAnimationIfNeeded, socket, setManualDisconnect, setAutoMatchOnReconnect } from './online.js';
import { showCountdown } from './ui.js';

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

let hamburgerMenuButton;
let adminRoomIdDisplay;
let adminStartGameButton;
let memberListUl;
let finalRankingList; // Added to be assigned in init
let gameEndTitle;     // Added to be assigned in init

let messageDisplay;
let gameEndOverlay;
let retryButton;
let lobbyButton;


// --- Stats State ---
let lastTime = 0;
let dropCounter = 0;
let gameStartTime = 0;
let keyPresses = 0;
let piecesPlaced = 0;
let pps = '0.00';
let apm = '0.0';
let time = '00:00';

let currentRoomId = null; // To keep track of the current room

// --- Helper function to set button state ---
function setButtonState(button, enabled) {
    if (!button) return; // Guard against null button
    button.disabled = !enabled;
    if (enabled) {
        button.classList.remove('disabled');
    } else {
        button.classList.add('disabled');
    }
}

// --- Message Display Function ---
let messageTimeout;
function showMessage({ type, message }) {
    clearTimeout(messageTimeout);
    if (messageDisplay) { // Ensure messageDisplay is defined
        messageDisplay.textContent = message;
        messageDisplay.className = ''; // Clear previous classes
        messageDisplay.classList.add('show', type);
        messageDisplay.style.display = 'block';

        messageTimeout = setTimeout(() => {
            messageDisplay.classList.remove('show');
            messageDisplay.style.display = 'none'; // Hide after animation
        }, 3000); // Message visible for 3 seconds
    }
}

// --- UI Display State Management ---
function setRoomDisplayState(inRoom, isHost = false, roomId = null, members = [], isPrivate = false) { // Added isPrivate
    if (inRoom) {
        lobbyOverlay.classList.add('hidden');
        mainMenuButtons.style.display = 'none';
        roomInfoDisplay.style.display = 'block';
        currentRoomIdDisplay.textContent = roomId;
        adminRoomIdDisplay.textContent = roomId; // Update admin modal room ID

        // Hamburger button visibility based on room type
        if (isPrivate) {
            hamburgerMenuButton.style.display = 'block';
        } else {
            hamburgerMenuButton.style.display = 'none'; // No hamburger for public matches
        }

        if (isHost) {
            roomHostStatusDisplay.textContent = '(ホスト)';
            hostStartGameButton.style.display = 'block';
            setButtonState(hostStartGameButton, true);
            setButtonState(adminStartGameButton, true); // Admin menu start button
        } else {
            roomHostStatusDisplay.textContent = '';
            hostStartGameButton.style.display = 'none';
            // Non-hosts can still see the hamburger for private rooms to check members, etc.
            if (isPrivate) { // Only show hamburger to non-hosts in private rooms
                hamburgerMenuButton.style.display = 'block'; 
            } else {
                hamburgerMenuButton.style.display = 'none'; // Ensure hidden for non-hosts in public rooms
            }
            setButtonState(adminStartGameButton, false); // Admin menu start button disabled for non-host
        }

        // Populate member list in admin modal
        if (memberListUl) { // Guard against null
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
        if (hamburgerMenuButton) hamburgerMenuButton.style.display = 'none'; // Hide hamburger when not in a room
        currentRoomId = null;
    }
}

// --- Modal Functions ---
function openModal(modal) {
    if (!modal) return; // Guard against null modal
    modal.style.display = 'block';
    mainMenuButtons.style.display = 'none';
    roomInfoDisplay.style.display = 'none'; // Also hide room info if showing
    if (hamburgerMenuButton) hamburgerMenuButton.style.display = 'none'; // Hide hamburger when other modals open
}

function closeModal(modal) {
    if (!modal) return; // Guard against null modal
    modal.style.display = 'none';
    mainMenuButtons.style.display = 'block'; // Show main menu buttons when modal is closed
    
    // Re-evaluate hamburger button visibility based on room state
    if (currentRoomId) { // If still in a room, hamburger might need to be shown
        // Re-request room info to get the latest state including isPrivate
        // This will trigger setRoomDisplayState and update hamburger visibility
        socket.emit('requestRoomInfo'); 
    } else { // Not in a room
        if (hamburgerMenuButton) hamburgerMenuButton.style.display = 'none';
    }
    // Clear inputs when closing
    if (modal === createRoomModal) {
        createRoomPasswordInput.value = '';
    } else if (modal === joinRoomModal) {
        joinRoomIdInput.value = '';
        joinRoomPasswordInput.value = '';
    }
}


// --- Game Loop ---
function update(now = performance.now()) {
    if (gameState === 'PLAYING') {
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
        
        updateEffects();
        sendBoardStatus(board, currentPiece);

        // Calculate stats
        const elapsedTime = (now - gameStartTime) / 1000;
        const minutes = Math.floor(elapsedTime / 60).toString().padStart(2, '0');
        const seconds = Math.floor(elapsedTime % 60).toString().padStart(2, '0');
        time = `${minutes}:${seconds}`;
        pps = (piecesPlaced / elapsedTime || 0).toFixed(2);
        apm = ((keyPresses * 60) / elapsedTime || 0).toFixed(1);

    } else {
        // Reset stats when not playing
        gameStartTime = 0;
        piecesPlaced = 0;
        keyPresses = 0;
    }

    // Update button states based on game state
    updateButtonStates();

    // Drawing is now separated and happens every frame regardless of state
    drawGame();
    drawUI();
    startAnimationIfNeeded();

    requestAnimationFrame(update);
}

// --- Function to update button states based on game state ---
function updateButtonStates() {
    if (gameState === 'LOBBY') {
        setButtonState(joinPublicMatchButton, true);
        setButtonState(retryButton, false);
        setButtonState(lobbyButton, false);
    } else if (gameState === 'PLAYING') {
        setButtonState(joinPublicMatchButton, false);
        setButtonState(retryButton, false);
        setButtonState(lobbyButton, false);
        setButtonState(hostStartGameButton, false);
        setButtonState(adminStartGameButton, false);
    } else if (gameState === 'GAME_OVER') {
        setButtonState(joinPublicMatchButton, false);
        setButtonState(retryButton, true);
        setButtonState(lobbyButton, true);
        setButtonState(hostStartGameButton, false);
        setButtonState(adminStartGameButton, false);
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

    hamburgerMenuButton = document.getElementById('hamburger-menu-button');
    adminRoomIdDisplay = document.getElementById('admin-room-id');
    adminStartGameButton = document.getElementById('admin-start-game-button'); // Error was here: document('admin-start-game-button')
    memberListUl = document.getElementById('member-list');
    finalRankingList = document.getElementById('final-ranking-list'); // Assigned here
    gameEndTitle = document.getElementById('game-end-title');     // Assigned here

    messageDisplay = document.getElementById('message-display');
    gameEndOverlay = document.getElementById('game-end-overlay');
    retryButton = document.getElementById('retry-button');
    lobbyButton = document.getElementById('lobby-button');


    setGameGetStatsCallback(getStats);
    setOnlineGetStatsCallback(getStats);
    setupCanvases();
    // initializeSocket(); // Should be called once, connectToServer handles it
    connectToServer();
    gameEndOverlay.classList.remove('visible');
    setGameState('LOBBY');
    resetGame();
    lastTime = performance.now();
    update();
    updateButtonStates(); // Initial button state update
    if (hamburgerMenuButton) hamburgerMenuButton.style.display = 'none'; // Ensure hamburger is hidden initially
    if (messageDisplay) messageDisplay.style.display = 'none'; // Ensure message display is hidden initially
    
    // --- Event Listeners ---
    joinPublicMatchButton.onclick = () => {
        // For public matches, hamburger button should not be shown.
        setRoomDisplayState(true, false, null, [], false); // isHost=false, roomId=null, members=[], isPrivate=false
        startMatching();
        setButtonState(joinPublicMatchButton, false);
    };

    createRoomButton.onclick = () => {
        openModal(createRoomModal);
    };

    joinRoomButton.onclick = () => {
        openModal(joinRoomModal);
    };

    hamburgerMenuButton.onclick = () => { // New: Open admin menu
        if (currentRoomId) {
            openModal(adminMenuModal);
        } else {
            showMessage({ type: 'info', message: 'ルームに参加していません。' });
        }
    };

    closeModalButtons.forEach(button => {
        button.onclick = (event) => {
            closeModal(event.target.closest('.modal'));
        };
    });

    confirmCreateRoomButton.onclick = () => {
        const plainPassword = createRoomPasswordInput.value;
        socket.emit('createPrivateRoom', { plainPassword });
        closeModal(createRoomModal);
        // UI state will be handled by roomInfo event from server
    };

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

    hostStartGameButton.onclick = () => {
        socket.emit('startGame');
        setButtonState(hostStartGameButton, false); // Disable until game starts or error
    };

    adminStartGameButton.onclick = () => { // New: Start game from admin menu
        socket.emit('startGame');
        setButtonState(adminStartGameButton, false);
    };

    retryButton.onclick = () => {
        setManualDisconnect(true);
        setAutoMatchOnReconnect(true); // Do auto-match when retrying
        socket.disconnect();
        gameEndOverlay.classList.remove('visible');
        connectToServer(); // Reconnect will be handled by connect event in online.js
        setButtonState(retryButton, false);
        setButtonState(lobbyButton, false);
    };

    lobbyButton.onclick = () => {
        setManualDisconnect(true);
        setAutoMatchOnReconnect(false); // Don't auto-match when going back to lobby
        socket.disconnect();
        gameEndOverlay.classList.remove('visible');
        setGameState('LOBBY');
        resetGame();
        setRoomDisplayState(false); // Go back to main lobby view
        setButtonState(lobbyButton, false);
        setButtonState(retryButton, false);
        setButtonState(joinPublicMatchButton, true);
        // Reconnect the socket after disconnecting to allow new matching
        connectToServer();
    };

    // --- Socket Event Handlers ---
    socket.on('roomInfo', (data) => {
        currentRoomId = data.roomId;
        const isHost = data.hostId === socket.id;
        setRoomDisplayState(true, isHost, data.roomId, data.members, data.isPrivate); // Pass isPrivate
        
        // Additional logic for public room matching start countdown
        if (!data.isPrivate && !data.isGameStarted && !data.isCountingDown && data.members.length >= CONFIG.MIN_PLAYERS_TO_START) {
            // Public matching rooms start countdown automatically once enough players join
            // No host button needed for public rooms
        }
    });




    socket.on('kicked', ({ reason }) => { // New handler for kicked players
        showMessage({ type: 'error', message: `キックされました: ${reason}` });
        setGameState('LOBBY');
        resetGame();
        setRoomDisplayState(false);
        updateButtonStates();
    });

    socket.on('uiMessage', (data) => { // New generic message handler
        showMessage(data);
    });

    socket.on('disconnect', () => {
        setGameState('LOBBY');
        resetGame();
        setRoomDisplayState(false); // Reset to lobby view
        updateButtonStates();
    });
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

init();