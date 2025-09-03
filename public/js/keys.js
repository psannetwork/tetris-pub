import { CONFIG } from './config.js';
import { currentPiece, movePiece, rotatePiece, hardDrop, hold, addGarbageLines, gameState } from './game.js';
import { incrementKeyPresses } from './main.js'; // Import for APM

export let keys = {};

function handleKeyDown(event) {
    if (gameState !== 'PLAYING' || keys[event.code]) return;

    keys[event.code] = { startTime: performance.now(), lastRepeat: performance.now() };
    incrementKeyPresses(); // Count for APM

    switch (event.code) {
        case CONFIG.keyBindings.moveLeft: movePiece({ x: -1, y: 0 }); break;
        case CONFIG.keyBindings.moveRight: movePiece({ x: 1, y: 0 }); break;
        case CONFIG.keyBindings.softDrop: movePiece({ x: 0, y: 1 }); break;
        case CONFIG.keyBindings.rotateCCW: rotatePiece(currentPiece, -1); break;
        case CONFIG.keyBindings.rotateCW: rotatePiece(currentPiece, 1); break;
        case CONFIG.keyBindings.hardDrop: hardDrop(); break;
        case CONFIG.keyBindings.hold: hold(); break;
        case "KeyG": if (CONFIG.debug.enableGarbage) addGarbageLines(1); break;
    }

    if (Object.values(CONFIG.keyBindings).includes(event.code) || event.code === "KeyG") {
        event.preventDefault();
    }
}

function handleKeyUp(event) {
    if (keys[event.code]) {
        delete keys[event.code];
    }
}

document.addEventListener("keydown", handleKeyDown);
document.addEventListener("keyup", handleKeyUp);


// --- Mobile Controls ---
const mobileControls = {
    'btn-left': () => movePiece({ x: -1, y: 0 }),
    'btn-right': () => movePiece({ x: 1, y: 0 }),
    'btn-down': () => movePiece({ x: 0, y: 1 }),
    'btn-rotate': () => rotatePiece(currentPiece, 1),
    'btn-drop': () => hardDrop(),
    'btn-hold': () => hold()
};

for (const [id, action] of Object.entries(mobileControls)) {
    const button = document.getElementById(id);
    if (button) {
        button.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (gameState === 'PLAYING') {
                incrementKeyPresses(); // Count for APM
                action();
            }
        }, { passive: false });
    }
}
