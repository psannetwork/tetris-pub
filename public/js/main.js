import { setGameGetStatsCallback } from './core/game.js';
import { setOnlineGetStatsCallback, setCloseMenuCallback, setRoomClosedCallback, initializeSocket, setUIMessageCallback } from './network/online.js';
import { CONFIG, applyCustomSettings } from './core/config.js';
import { 
    gameState, setGameState, resetGame,
    currentPiece, level, isValidPosition, lockPiece, movePiece, LOCK_DELAY,
    board, score, linesCleared
} from './core/game.js';
import { drawGame, drawUI, setupCanvases } from './engine/draw.js';
import * as Effects from './engine/effects.js';
import { handleInput } from './engine/input.js';
import { register, login, logout, resumeSession, updateSettings, setAuthCallbacks, sendBoardStatus, connectToServer, startMatching, currentCountdown, drawAllMiniBoards, startAnimationIfNeeded, socket, setManualDisconnect, setAutoMatchOnReconnect, setCurrentRoomId, getCurrentRoomId, isSpectating, setSpectating, spectateRoom, requestPublicRooms, setPublicRoomsListCallback, setSpectateRoomInfoCallback, miniboardSlots, addOpponent, removeOpponent, drawTargetLines, finalRanking, finalStatsMap, resetRankingData, processMiniboardRedrawRequest, resetOnlineState, totalPlayersAtStart } from './network/online.js';
import { showCountdown } from './ui/ui.js';

// --- Cookie Helpers ---
function setCookie(name, value, days) {
    const expires = new Date();
    expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
    document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
}

function getCookie(name) {
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) === ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
}

function eraseCookie(name) {
    document.cookie = name + '=; Max-Age=-99999999;path=/;SameSite=Lax';
}

// --- Auth DOM Elements ---
let currentUser = null; // Persist user data across socket re-initialization
let authContainer;
let loginForm;
let signupForm;
let userProfileDisplay;
let displayNickname;
let displayRating;
let loginUsernameInput;
let loginPasswordInput;
let signupUsernameInput;
let signupPasswordInput;
let signupNicknameInput;
let settingsModal;
let settingsNicknameInput;
let settingsRatingInput;
let saveSettingsButton;

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

// --- Settings State ---
let currentKeyBindings = {};
let activeBindingButton = null;

function setupSettingsUI(user) {
    if (!user) {
        console.warn("setupSettingsUI: No user data provided");
        return;
    }
    settingsNicknameInput.value = user.nickname || user.username || "";
    document.getElementById('settings-current-rating').textContent = user.rating || 0;

    currentKeyBindings = { ...CONFIG.keyBindings };
    if (user.settings && user.settings.keyBindings) {
        Object.assign(currentKeyBindings, user.settings.keyBindings);
    }

    const bindMap = {
        'kb-left': 'moveLeft', 'kb-right': 'moveRight', 'kb-soft': 'softDrop',
        'kb-hard': 'hardDrop', 'kb-rotateCCW': 'rotateCCW', 'kb-rotateCW': 'rotateCW',
        'kb-hold': 'hold'
    };

    Object.keys(bindMap).forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        const action = bindMap[btnId];
        btn.textContent = currentKeyBindings[action];
        btn.onclick = (e) => {
            e.stopPropagation();
            if (activeBindingButton) activeBindingButton.classList.remove('active');
            activeBindingButton = btn;
            btn.classList.add('active');
            btn.textContent = '入力待ち...';
        };
    });

    const keys = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
    keys.forEach((key, index) => {
        const picker = document.getElementById(`color-${key}`);
        if (picker) {
            picker.value = (user.settings && user.settings.colors && user.settings.colors[key]) 
                || CONFIG.colors.tetromino[index + 1];
        }
    });
}

window.addEventListener('keydown', (e) => {
    if (activeBindingButton) {
        const bindMap = {
            'kb-left': 'moveLeft', 'kb-right': 'moveRight', 'kb-soft': 'softDrop',
            'kb-hard': 'hardDrop', 'kb-rotateCCW': 'rotateCCW', 'kb-rotateCW': 'rotateCW',
            'kb-hold': 'hold'
        };
        const action = bindMap[activeBindingButton.id];
        currentKeyBindings[action] = e.code;
        activeBindingButton.textContent = e.code;
        activeBindingButton.classList.remove('active');
        activeBindingButton = null;
        e.preventDefault();
    }
});

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
            Effects.startTimeoutEffect(message);
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
            members.forEach(member => {
                // Support both ID string (fallback) and rich member object
                const memberId = typeof member === 'object' ? member.id : member;
                const displayName = typeof member === 'object' ? member.displayName : member.substring(0, 6);
                const rating = typeof member === 'object' && member.rating !== null ? ` [R:${member.rating}]` : '';

                const li = document.createElement('li');
                
                if (memberId === socket.id) {
                    li.innerHTML = `<span class="self">${displayName}${rating} (あなた)</span>`;
                } else {
                    li.textContent = `${displayName}${rating}`;
                    if (isHost) {
                        const kickButton = document.createElement('button');
                        kickButton.textContent = 'キック';
                        kickButton.classList.add('kick-button');
                        kickButton.dataset.playerId = memberId;
                        kickButton.onclick = () => {
                            socket.emit('kickPlayer', { playerIdToKick: memberId });
                        };
                        li.appendChild(kickButton);
                    }
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
    if (!modal) return; 
    modal.style.display = 'block';
    mainMenuButtons.style.display = 'none';
    roomInfoDisplay.style.display = 'none'; 
    if (menuButton) { 
        menuButton.style.display = 'none'; 
    }
}

function closeModal(modal) {
    if (!modal) return; 
    modal.style.display = 'none';

    // Re-evaluate UI state after closing a modal
    if (getCurrentRoomId()) {
        // Only request fresh room info if we are NOT in a game/spectating
        // to avoid interrupting the active game state.
        if (gameState !== 'PLAYING' && gameState !== 'SPECTATING') {
            socket.emit('requestRoomInfo');
        }
        // Always restore the menu button if we are in a room
        if (menuButton) {
            menuButton.style.display = 'flex';
        }
    } else {
        // If not in a room, we are in the lobby. Show main menu.
        mainMenuButtons.style.display = 'block';
        roomInfoDisplay.style.display = 'none';
    }

    // Restore game board visibility
    document.getElementById('main-game-board').style.display = 'block';
    
    // ... rest of the function ...


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


// --- Audio Management ---
const lobbyBgm = new Audio('bgm/loby.mp3');
const gameBgm = new Audio('bgm/playing1.mp3');
lobbyBgm.loop = true;
gameBgm.loop = true;
lobbyBgm.volume = 0.2;
gameBgm.volume = 0.2;

let currentBgm = null;

function playBgm(type) {
    let nextBgm = null;
    if (type === 'lobby') nextBgm = lobbyBgm;
    else if (type === 'game') nextBgm = gameBgm;

    // If already playing the requested track, do nothing
    if (currentBgm === nextBgm && currentBgm && !currentBgm.paused) {
        return;
    }

    if (currentBgm && currentBgm !== nextBgm) {
        currentBgm.pause();
        // Reset game BGM when switching away, but keep lobby BGM position
        if (currentBgm === gameBgm) currentBgm.currentTime = 0;
    }
    
    currentBgm = nextBgm;
    
    if (currentBgm) {
        currentBgm.play().catch(e => console.log("Audio play blocked"));
    }
}

function stopBGM(reset = false) {
    if (currentBgm) {
        currentBgm.pause();
        if (reset) currentBgm.currentTime = 0;
    }
}

// --- Game Loop ---
function update(now = performance.now()) {
    try {
        const delta = now - lastTime;
        lastTime = now;

        // Initialize variables with defaults to prevent ReferenceErrors
        let currentElapsedTime = 0;
        let currentSurvivorRate = 1.0;

        if (gameState === 'PLAYING' && !isSpectating) { 
            if (gameStartTime === 0) {
                gameStartTime = now;
                gameBgm.currentTime = 0; 
                playBgm('game'); 
            }
            
            dropCounter += delta;
            handleInput();

            currentElapsedTime = (now - gameStartTime) / 1000;

            const activeOpponents = miniboardSlots.filter(s => s.userId && !s.isGameOver).length;
            const totalActive = activeOpponents + 1;
            const startCount = Math.max(1, totalPlayersAtStart || totalActive); 
            currentSurvivorRate = totalActive / startCount;

            // --- Milestone Notifications ---
            if (typeof window._lastPlayersLeft === 'undefined') {
                window._lastPlayersLeft = totalActive;
            }

            const milestones = [50, 30, 20, 10, 5, 2];
            if (totalActive < window._lastPlayersLeft) {
                const triggeredMilestone = milestones.find(m => totalActive <= m && window._lastPlayersLeft > m);
                if (triggeredMilestone && Effects.effectsCtx) {
                    Effects.addTextEffect(`${triggeredMilestone} PLAYERS LEFT`, { 
                        style: 'milestone',
                        duration: 3500, // Extended to 3.5 seconds
                        y: Effects.effectsCtx.canvas.height / 2 
                    });
                }
            }
            window._lastPlayersLeft = totalActive;

            // --- Optimized Dynamic Intensity Formula ---
            let intensity = (typeof level !== 'undefined') ? level : 1; 
            intensity += Math.floor(currentElapsedTime / 30);

            if (currentSurvivorRate <= 0.1) {
                intensity += 80;
            } else if (currentSurvivorRate <= 0.3) {
                intensity += 50;
            } else if (currentSurvivorRate <= 0.5) {
                intensity += 30;
            } else if (currentSurvivorRate <= 0.7) {
                intensity += 10;
            }

            // 4. Calculate final drop interval
            const calcLevel = Math.max(1, Math.min(100, intensity));
            let dropInterval = 1000 * Math.pow(0.9, calcLevel - 1);
            
            const is20G = intensity >= 70;

            dropCounter += delta;
            
            if (is20G) {
                // 20G: Super fast fall (3 rows per frame) instead of instant teleport
                // This makes the movement visible while staying extremely fast
                if (currentPiece) {
                    for (let i = 0; i < 3; i++) {
                        if (isValidPosition(currentPiece, 0, 1)) {
                            movePiece({ x: 0, y: 1 });
                        }
                    }
                }
                dropCounter = 0;
            } else if (dropCounter >= dropInterval) {
                // Normal free fall
                if (currentPiece) {
                    movePiece({ x: 0, y: 1 });
                }
                dropCounter = 0;
            }

            if (currentPiece && !isValidPosition(currentPiece, 0, 1)) {
                currentPiece.lockDelay += delta;
                if (currentPiece.lockDelay >= LOCK_DELAY) {
                    lockPiece();
                    piecesPlaced++; 
                }
            }
            
            sendBoardStatus(board, currentPiece);

            // Calculate stats
            const minutes = Math.floor(currentElapsedTime / 60).toString().padStart(2, '0');
            const seconds = Math.floor(currentElapsedTime % 60).toString().padStart(2, '0');
            time = `${minutes}:${seconds}`;
            pps = (piecesPlaced / currentElapsedTime || 0).toFixed(2);
            apm = ((keyPresses * 60) / currentElapsedTime || 0).toFixed(1);

        } else {
            gameStartTime = 0;
            piecesPlaced = 0;
            keyPresses = 0;
        }

        // Update button states less frequently (approx every 100ms)
        if (!window._lastButtonUpdateTime || now - window._lastButtonUpdateTime > 100) {
            updateButtonStates();
            window._lastButtonUpdateTime = now;
        }

        // Drawing is now separated and happens every frame regardless of state
        Effects.updateEffects(); 
        drawGame();
        drawUI();
        processMiniboardRedrawRequest(); 
        
        // drawAllEffects handles text, particles, orbs, and miniboard entry effects
        Effects.drawAllEffects(); 
        
        if (Effects.effectsCtx && !isSpectating) {
            drawTargetLines(Effects.effectsCtx);
        }

        startAnimationIfNeeded(); 

    } catch (error) {
        console.error("🚀 Game Loop Error:", error);
    }

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
    } else if (gameState === 'GAME_OVER') { 
        setButtonState(joinPublicMatchButton, false);
        setButtonState(retryButton, !isSpectating); // Spectators can't retry
        setButtonState(lobbyButton, true);
        setButtonState(spectateButton, false); 
        setButtonState(joinPublicSpectateButton, false); 
        
        // Host can still see start button if in a private room to restart
        setButtonState(hostStartGameButton, appState.isPrivate && isHost && !isSpectating);
        setButtonState(adminStartGameButton, appState.isPrivate && isHost && !isSpectating);

        if (retryButton) {
            retryButton.textContent = appState.isPrivate ? 'ルームに戻る' : 'Play Again';
        }
    } else if (gameState === 'SPECTATING' || isSpectating) { 
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
    // Auth Elements
    authContainer = document.getElementById('auth-container');
    loginForm = document.getElementById('login-form');
    signupForm = document.getElementById('signup-form');
    userProfileDisplay = document.getElementById('user-profile-display');
    displayNickname = document.getElementById('display-nickname');
    displayRating = document.getElementById('display-rating');
    loginUsernameInput = document.getElementById('login-username');
    loginPasswordInput = document.getElementById('login-password');
    signupUsernameInput = document.getElementById('signup-username');
    signupPasswordInput = document.getElementById('signup-password');
    signupNicknameInput = document.getElementById('signup-nickname');
    settingsModal = document.getElementById('settings-modal');
    settingsNicknameInput = document.getElementById('settings-nickname');
    settingsRatingInput = document.getElementById('settings-rating');
    saveSettingsButton = document.getElementById('save-settings-button');

    // Auth Callbacks
    setAuthCallbacks({
        onRegisterSuccess: (data) => {
            showMessage({ type: 'success', message: '登録が完了しました。ログインしてください。' });
            signupForm.style.display = 'none';
            loginForm.style.display = 'block';
        },
        onRegisterError: (data) => {
            showMessage({ type: 'error', message: data.message });
        },
        onLoginSuccess: (data) => {
            if (!data.isResume) {
                showMessage({ type: 'success', message: 'ログインしました。' });
                setCookie('session_username', data.user.username, 30);
            }
            authContainer.style.display = 'none';
            userProfileDisplay.style.display = 'block';
            mainMenuButtons.style.display = 'block';
            displayNickname.textContent = data.user.nickname;
            displayRating.textContent = data.user.rating;
            
            if (data.user.settings) {
                applyCustomSettings(data.user.settings);
                setupCanvases();
            }
            currentUser = data.user;
            if (socket) socket.user = data.user;
        },
        onLogoutSuccess: () => {
            eraseCookie('session_username');
            currentUser = null;
            if (socket) socket.user = null;
            userProfileDisplay.style.display = 'none';
            mainMenuButtons.style.display = 'none';
            authContainer.style.display = 'block';
            showMessage({ type: 'info', message: 'ログアウトしました。' });
            // リセット設定
            applyCustomSettings(CONFIG.defaultSettings || {});
            setupCanvases();
        },
        onLoginError: (data) => {
            showMessage({ type: 'error', message: data.message });
        },
        onSettingsUpdated: (data) => {
            showMessage({ type: 'success', message: '設定を保存しました。' });
            displayNickname.textContent = data.user.nickname;
            displayRating.textContent = data.user.rating;
            currentUser = data.user;
            if (socket) socket.user = data.user;
            applyCustomSettings(data.user.settings);
            setupCanvases();
            closeModal(settingsModal);
        },
        onRatingUpdate: (data) => {
            displayRating.textContent = data.newRating;
            if (currentUser) {
                currentUser.rating = data.newRating;
            }
        }
    });

    // Auth Button Handlers
    document.getElementById('show-signup-button').onclick = () => {
        loginForm.style.display = 'none';
        signupForm.style.display = 'block';
    };
    document.getElementById('show-login-button').onclick = () => {
        signupForm.style.display = 'none';
        loginForm.style.display = 'block';
    };
    document.getElementById('login-button').onclick = () => {
        login(loginUsernameInput.value, loginPasswordInput.value);
    };
    document.getElementById('signup-button').onclick = () => {
        register(signupUsernameInput.value, signupPasswordInput.value, signupNicknameInput.value);
    };
    document.getElementById('edit-settings-button').onclick = () => {
        if (!currentUser) {
            showMessage({ type: 'error', message: 'ユーザー情報が見つかりません。再ログインしてください。' });
            return;
        }
        setupSettingsUI(currentUser);
        openModal(settingsModal);
    };
    saveSettingsButton.onclick = () => {
        const colors = {};
        ['I', 'J', 'L', 'O', 'S', 'T', 'Z'].forEach(key => {
            const picker = document.getElementById(`color-${key}`);
            if (picker) colors[key] = picker.value;
        });

        const newSettings = {
            keyBindings: currentKeyBindings,
            colors: colors
        };
        
        showMessage({ type: 'info', message: '保存中...' });
        
        socket.emit('update_settings', { 
            nickname: settingsNicknameInput.value,
            settings: newSettings
        });
    };

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
             playBgm('lobby');
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


    // NEW: Stop BGM during countdown
    if (socket) {
        socket.on("CountDown", (count) => {
            // Silence BGM during countdown (matching or game start)
            if (count !== null && count !== "") {
                stopBGM();
            }
        });
    }

    setGameGetStatsCallback(getStats);
    setOnlineGetStatsCallback(getStats);
    setupCanvases();
    // NEW: Initialize effects canvas
    const effectCanvas = document.getElementById('effect-canvas');
    if (effectCanvas) {
        Effects.initEffects(effectCanvas);
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

    // NEW: Start lobby BGM on first interaction anywhere on the page
    const startAudioOnFirstClick = () => {
        playBgm('lobby');
        window.removeEventListener('click', startAudioOnFirstClick);
        window.removeEventListener('keydown', startAudioOnFirstClick);
    };
    window.addEventListener('click', startAudioOnFirstClick);
    window.addEventListener('keydown', startAudioOnFirstClick);

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
            playBgm('lobby');
            // For public matches, hamburger button should not be shown. -> CHANGED: It SHOULD be shown now.
            setRoomDisplayState(true, false, null, [], false); // isHost=false, roomId=null, members=[], isPrivate=false
            startMatching();
            setButtonState(joinPublicMatchButton, false);
        };
    }

    if (createRoomButton) {
        createRoomButton.onclick = () => {
            playBgm('lobby');
            openModal(createRoomModal);
        };
    }

    if (joinRoomButton) {
        joinRoomButton.onclick = () => {
            playBgm('lobby');
            openModal(joinRoomModal);
        };
    }

    // NEW: Public Spectate Button
    if (joinPublicSpectateButton) {
        joinPublicSpectateButton.onclick = () => {
            playBgm('lobby');
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
            playBgm('lobby');
            setManualDisconnect(true);
            setAutoMatchOnReconnect(false); 
            if (socket) {
                socket.disconnect();
            }
            if (gameEndOverlay) gameEndOverlay.classList.remove('visible');
            setGameState('LOBBY');
            setSpectating(false); // Ensure spectating is cleared
            resetGame();
            resetAppState();
            setRoomDisplayState(false); 
            
            updateButtonStates();

            // Reconnect the socket
            setTimeout(() => {
                initializeSocket(); 
                connectToServer();
            }, 100);
        };
    }

    // NEW: Spectator Back to Lobby Button
    if (spectatorBackToLobbyButton) {
        spectatorBackToLobbyButton.onclick = () => {
            playBgm('lobby');
            setManualDisconnect(true);
            setAutoMatchOnReconnect(false);
            if (socket) {
                socket.disconnect();
            }
            
            // Set state to LOBBY and clear room state first to prevent closeModal from emitting
            setGameState('LOBBY');
            setSpectating(false); 
            setRoomDisplayState(false);
            
            closeModal(spectatorMenuModal);
            gameEndOverlay.classList.remove('visible'); 
            resetGame();

            // Explicitly set button states for the lobby
            updateButtonStates();

            // Delay reconnection slightly to ensure disconnect events are processed
            setTimeout(() => {
                initializeSocket();
                connectToServer();
            }, 100);
        };
    };

    if (document.getElementById('logout-button')) {
        document.getElementById('logout-button').onclick = () => {
            logout();
        };
    }

    // Check for existing session
    const savedUsername = getCookie('session_username');
    if (savedUsername) {
        console.log("Found saved session for:", savedUsername);
        resumeSession(savedUsername);
    }
}

// --- Public Functions ---

export function incrementKeyPresses() {
    keyPresses++;
}

export function getStats() {
    const activeOpponents = miniboardSlots.filter(s => s.userId && !s.isGameOver).length;
    return { 
        time,
        lines: linesCleared,
        level,
        score,
        apm,
        pps,
        playersLeft: activeOpponents + 1
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
    playBgm('game'); // Start game BGM for spectators
    // Don't clear effects when spectating - keep showing game effects
    setSpectating(true); 
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
    Effects.clearAllEffects();
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