
import { CONFIG } from './config.js';
import { 
    currentPiece, 
    isGameOver, 
    isGameClear, 
    level, 
    isValidPosition, 
    lockPiece, 
    movePiece, 
    initializePieces, 
    LOCK_DELAY, 
    setCurrentPiece 
} from './game.js';
 import { drawGame, drawUI, overlayCanvas, overlayCtx } from './draw.js';
import { updateEffects, effects, tspinEffect } from './effects.js';
import { handleInput } from './input.js';
import { sendBoardStatus, connectionError, drawConnectError, drawCountdown } from './online.js';
// ...
    

let lastTime = performance.now();
let dropCounter = 0;

export function update(time = performance.now()) {
    drawGame(); // Draw game elements
    drawUI();   // Draw UI elements
    

    if (connectionError) {
        drawConnectError();
        requestAnimationFrame(update);
        return;
    }

    if (isGameOver || isGameClear) {
        // Game over or clear, just draw and return
        requestAnimationFrame(update);
        return;
    }

    handleInput();

    const delta = time - lastTime;
    lastTime = time;

    if (effects.length === 0 && tspinEffect === null) {
        dropCounter += delta;
        if (dropCounter > CONFIG.dropInterval / level) {
            movePiece({ x: 0, y: 1 });
            dropCounter = 0;
        }
    }

    if (!isValidPosition(currentPiece, 0, 1)) {
        currentPiece.lockDelay += delta;
        if (currentPiece.lockDelay >= LOCK_DELAY) {
            lockPiece();
            requestAnimationFrame(update);
            return;
        }
    } else {
        currentPiece.lockDelay = 0;
    }

    updateEffects();
    sendBoardStatus();
    requestAnimationFrame(update);
}


