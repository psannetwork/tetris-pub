
import { CONFIG } from './config.js';
import { movePiece, rotatePiece, hardDrop, hold, currentPiece } from './game.js';
import { keys } from './keys.js';

export const DAS = 150;
export const ARR = 50;
export const SD_ARR = 50;

export let isKeyOperation = false;

export function handleInput() {
    isKeyOperation = true;
    const now = performance.now();

    if (keys[CONFIG.keyBindings.moveLeft]) {
        const keyObj = keys[CONFIG.keyBindings.moveLeft];
        if (now - keyObj.startTime >= DAS && now - keyObj.lastRepeat >= ARR) {
            movePiece({ x: -1, y: 0 });
            keyObj.lastRepeat = now;
        }
    }

    if (keys[CONFIG.keyBindings.moveRight]) {
        const keyObj = keys[CONFIG.keyBindings.moveRight];
        if (now - keyObj.startTime >= DAS && now - keyObj.lastRepeat >= ARR) {
            movePiece({ x: 1, y: 0 });
            keyObj.lastRepeat = now;
        }
    }

    if (keys[CONFIG.keyBindings.softDrop]) {
        const keyObj = keys[CONFIG.keyBindings.softDrop];
        if (now - keyObj.lastRepeat >= SD_ARR) {
            movePiece({ x: 0, y: 1 });
            keyObj.lastRepeat = now;
        }
    }
}
