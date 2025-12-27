import { CONFIG } from '../core/config.js';
import { movePiece } from '../core/game.js';
import { keys } from './keys.js';
import { incrementKeyPresses } from '../main.js';

const DAS = 160; // Delayed Auto Shift in ms
const ARR = 30;  // Auto Repeat Rate in ms

export function handleInput() {
    const now = performance.now();

    // Handle keyboard input with DAS and ARR
    for (const key in keys) {
        if (Object.values(CONFIG.keyBindings).includes(key)) {
            const keyObj = keys[key];
            if (now - keyObj.startTime > DAS && now - keyObj.lastRepeat > ARR) {
                keyObj.lastRepeat = now;
                incrementKeyPresses(); // Also count repeats for APM
                
                switch (key) {
                    case CONFIG.keyBindings.moveLeft:
                        movePiece({ x: -1, y: 0 });
                        break;
                    case CONFIG.keyBindings.moveRight:
                        movePiece({ x: 1, y: 0 });
                        break;
                    case CONFIG.keyBindings.softDrop:
                        movePiece({ x: 0, y: 1 });
                        break;
                }
            }
        }
    }
}