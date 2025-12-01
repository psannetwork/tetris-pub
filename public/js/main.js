import { setGameGetStatsCallback } from './game.js';
import { setOnlineGetStatsCallback, setCloseMenuCallback, setRoomClosedCallback, initializeSocket, setUIMessageCallback } from './online.js';
import { CONFIG } from './config.js';
import { 
    gameState, setGameState, resetGame,
    currentPiece, level, isValidPosition, lockPiece, movePiece, LOCK_DELAY,
    board, score, linesCleared
} from './game.js';
import { drawGame, drawUI, setupCanvases } from './draw.js';
import { updateEffects, initEffects, startTimeoutEffect, drawMiniboardEntryEffects, clearAllEffects } from './effects.js';
import { handleInput } from './input.js';
import { sendBoardStatus, connectToServer, startMatching, currentCountdown, startAnimationIfNeeded, socket, setManualDisconnect, setAutoMatchOnReconnect, setCurrentRoomId, getCurrentRoomId, isSpectating, setSpectating, spectateRoom, requestPublicRooms, setPublicRoomsListCallback, setSpectateRoomInfoCallback, miniboardSlots, addOpponent, removeOpponent } from './online.js';
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
    if (hamburgerMenuButton) {
        hamburgerMenuButton.style.display = 'none';
    }
}

// --- Function to handle room closure ---
function handleRoomClosed() {
    setGameState('LOBBY');
    resetGame();
    setSpectating(false); // NEW: Reset spectating state
    setRoomDisplayState(false); // Go back to main lobby view
    updateButtonStates();
    showMessage({ type: 'info', message: 'ルームがホストによって閉鎖されました。' });
}



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
function showMessage({ type, message, data }) { // Added 'data' parameter
    clearTimeout(messageTimeout);
    if (messageDisplay) { // Ensure messageDisplay is defined
        messageDisplay.textContent = message;
        messageDisplay.className = ''; // Clear previous classes
        messageDisplay.classList.add('show', type);
        messageDisplay.style.display = 'block';

        if (type === 'timeout') { // NEW: Trigger timeout effect
            startTimeoutEffect(message);
        } else if (type === 'publicRoomsList' && data) { // NEW: Handle publicRoomsList
            populatePublicRoomsList(data);
            openModal(spectateRoomsModal);
        }

        messageTimeout = setTimeout(() => {
            messageDisplay.classList.remove('show');
            messageDisplay.style.display = 'none'; // Hide after animation
        }, 3000); // Message visible for 3 seconds
    }
}

// --- UI Display State Management ---
export function setRoomDisplayState(inRoom, isHost = false, roomId = null, members = [], isPrivate = false) { // Added isPrivate
    if (inRoom) {
        lobbyOverlay.classList.add('hidden');
        mainMenuButtons.style.display = 'none';
        roomInfoDisplay.style.display = 'block';
        currentRoomIdDisplay.textContent = roomId;
        adminRoomIdDisplay.textContent = roomId; // Update admin modal room ID

        // Hamburger button visibility based on room type or if spectating
        if (isPrivate || gameState === 'SPECTATING') { // NEW: show hamburger if spectating
            hamburgerMenuButton.style.display = 'block';
        } else {
            hamburgerMenuButton.style.display = 'none'; // No hamburger for public matches
        }

        if (isHost && !isSpectating) { // NEW: only show host buttons if not spectating
            roomHostStatusDisplay.textContent = '(ホスト)';
            hostStartGameButton.style.display = 'block';
            setButtonState(hostStartGameButton, true);
            setButtonState(adminStartGameButton, true); // Admin menu start button
        } else {
            roomHostStatusDisplay.textContent = '';
            hostStartGameButton.style.display = 'none';
            // Non-hosts can still see the hamburger for private rooms to check members, etc.
            if (isPrivate && !isSpectating) { // Only show hamburger to non-hosts in private rooms
                hamburgerMenuButton.style.display = 'block'; 
            } else if (gameState === 'SPECTATING') { // NEW: if spectating, hamburger is for spectator menu
                hamburgerMenuButton.style.display = 'block';
            } else {
                hamburgerMenuButton.style.display = 'none'; // Ensure hidden for non-hosts in public rooms
            }
            setButtonState(adminStartGameButton, false); // Admin menu start button disabled for non-host
        }
        
        // Hide game-related panels if spectating
        if (isSpectating) {
            document.getElementById('game-left-panel').style.display = 'none';
            document.getElementById('game-right-panel').style.display = 'none';
            document.getElementById('attack-bar').style.display = 'none';
        } else {
            document.getElementById('game-left-panel').style.display = 'block';
            document.getElementById('game-right-panel').style.display = 'block';
            document.getElementById('attack-bar').style.display = 'block';
        }

        // Populate member list in admin modal (only if not spectating and host)
        if (memberListUl && !isSpectating) { // NEW: Only show member list if not spectating
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
        setCurrentRoomId(null);
        setSpectating(false); // NEW: Ensure spectating state is false
        // Restore game-related panels if they were hidden
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
    if (hamburgerMenuButton) hamburgerMenuButton.style.display = 'none'; // Hide hamburger when other modals open
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
    mainMenuButtons.style.display = 'block'; // Show main menu buttons when modal is closed
    
    // Re-evaluate hamburger button visibility based on room state
    if (getCurrentRoomId()) { // If still in a room, hamburger might need to be shown
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
    // NEW: Clear spectator rooms list
    if (modal === spectateRoomsModal) {
        publicRoomsList.innerHTML = '';
        noPublicRoomsMessage.style.display = 'none';
    }
    // NEW: Restore game-related elements if spectating and closing spectator menu
    if (isSpectating && (modal === spectatorMenuModal || modal === spectateRoomsModal)) {
        document.getElementById('game-left-panel').style.display = 'none'; // Should already be none
        document.getElementById('game-right-panel').style.display = 'none'; // Should already be none
        document.getElementById('attack-bar').style.display = 'none'; // Should already be none
        document.getElementById('main-game-board').style.display = 'block'; // Restore main board
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
        
        updateEffects();
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
        updateEffects();
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
    drawGame();
    drawUI();
    drawMiniboardEntryEffects(now); // NEW: Draw miniboard entry effects
    startAnimationIfNeeded();

    requestAnimationFrame(update);
}

// --- Function to update button states based on game state ---
function updateButtonStates() {
    if (gameState === 'LOBBY') {
        setButtonState(joinPublicMatchButton, true);
        setButtonState(retryButton, false);
        setButtonState(lobbyButton, false);
        setButtonState(spectateButton, false); // NEW
        setButtonState(joinPublicSpectateButton, true); // NEW
    } else if (gameState === 'PLAYING' && !isSpectating) { // NEW: Check !isSpectating
        setButtonState(joinPublicMatchButton, false);
        setButtonState(retryButton, false);
        setButtonState(lobbyButton, false);
        setButtonState(spectateButton, false); // NEW
        setButtonState(joinPublicSpectateButton, false); // NEW
        setButtonState(hostStartGameButton, false);
        setButtonState(adminStartGameButton, false);
    } else if (gameState === 'GAME_OVER' && !isSpectating) { // NEW: Check !isSpectating
        setButtonState(joinPublicMatchButton, false);
        setButtonState(retryButton, true);
        setButtonState(lobbyButton, true);
        setButtonState(spectateButton, true); // NEW
        setButtonState(joinPublicSpectateButton, false); // NEW
        setButtonState(hostStartGameButton, false);
        setButtonState(adminStartGameButton, false);
    } else if (gameState === 'SPECTATING') { // NEW: Spectating state
        setButtonState(joinPublicMatchButton, false);
        setButtonState(retryButton, false);
        setButtonState(lobbyButton, false);
        setButtonState(spectateButton, false); // NEW
        setButtonState(joinPublicSpectateButton, false); // NEW
        setButtonState(hostStartGameButton, false);
        setButtonState(adminStartGameButton, false);
        // spectatorBackToLobbyButton is only enabled when spectatorMenuModal is open, handled by modal logic
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
    if (hamburgerMenuButton) hamburgerMenuButton.style.display = 'none'; // Ensure hamburger is hidden initially
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

    // NEW: Public Spectate Button
    joinPublicSpectateButton.onclick = () => {
        requestPublicRooms(); // Request list of public rooms
        openModal(spectateRoomsModal);
    };

    hamburgerMenuButton.onclick = () => { // New: Open admin menu OR spectator menu
        if (gameState === 'SPECTATING') {
            openModal(spectatorMenuModal);
            // Populate spectator ranking list if data is available
            if (finalRanking) {
                displaySpectatorRanking(finalRanking, socket.id, finalStatsMap);
            }
        } else if (getCurrentRoomId()) {
            openModal(adminMenuModal);
        } else {
            showMessage({ type: 'info', message: 'ルームに参加していません。' });
        }
    };

    closeModalButtons.forEach(button => {
        button.onclick = (event) => {
            const modal = event.target.closest('.modal');
            closeModal(modal);
            if (modal === spectateRoomsModal) { // Clear list when closing
                publicRoomsList.innerHTML = '';
            }
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
        if (socket) {
            socket.disconnect();
        }
        gameEndOverlay.classList.remove('visible');
        initializeSocket(); // Reinitialize socket to ensure clean state
        connectToServer(); // Reconnect will be handled by connect event in online.js
        setButtonState(retryButton, false);
        setButtonState(lobbyButton, false);
        setButtonState(spectateButton, false); // NEW
    };

    // NEW: Spectate Button on Game Over screen
    spectateButton.onclick = () => {
        const currentId = getCurrentRoomId();
        if (currentId) {
            startSpectating(currentId);
            gameEndOverlay.classList.remove('visible');
            setButtonState(retryButton, false);
            setButtonState(lobbyButton, false);
            setButtonState(spectateButton, false);
        }
    };

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
        initializeSocket(); // Reinitialize socket to ensure clean state
        connectToServer();
    };

    // NEW: Spectator Back to Lobby Button
    spectatorBackToLobbyButton.onclick = () => {
        setManualDisconnect(true);
        setAutoMatchOnReconnect(false);
        if (socket) {
            socket.disconnect();
        }
        closeModal(spectatorMenuModal);
        setGameState('LOBBY');
        resetGame();
        setSpectating(false); // Clear spectating state
        setRoomDisplayState(false);
        initializeSocket();
        connectToServer();
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
    setGameState('SPECTATING');
    resetGame();
    clearAllEffects();
    setSpectating(true); // Set spectating state
    setRoomDisplayState(true, false, roomId, [], false); // Update UI for spectating
    spectateRoom(roomId); // Tell server to spectate
    updateButtonStates();
    // Hide main game elements not needed for spectating
    document.getElementById('main-game-board').style.display = 'block'; // Ensure board itself is visible
    document.getElementById('score-display').style.display = 'none'; // Hide score for player, show only opponent boards
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
            spectateBtn.onclick = () => {
                startSpectating(room.roomId);
                closeModal(spectateRoomsModal);
            };
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

    // Clear and re-add miniboards based on spectated room members
    const currentOpponents = new Set(miniboardSlots.filter(s => s.userId).map(s => s.userId));
    const newOpponentIds = new Set(data.members.filter(id => id !== socket.id));

    currentOpponents.forEach(id => {
        if (!newOpponentIds.has(id)) removeOpponent(id);
    });
    newOpponentIds.forEach(id => {
        if (!currentOpponents.has(id)) addOpponent(id);
    });
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

init();