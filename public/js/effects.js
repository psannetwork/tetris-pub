
import { CONFIG } from './config.js';

export let effects = [];
export let tspinEffect = null;

export function triggerLineClearEffect(rows) {
    effects.push({
        type: 'lineClear',
        rows,
        startTime: Date.now(),
        duration: CONFIG.effects.lineClearDuration
    });
}

export function triggerTspinEffect(x, y) {
    tspinEffect = {
        type: 'tspin',
        x,
        y,
        startTime: Date.now(),
        duration: CONFIG.effects.tspinEffectDuration
    };
}

export function updateEffects() {
    const now = Date.now();
    effects = effects.filter(e => now - e.startTime < e.duration);
    if (tspinEffect && now - tspinEffect.startTime >= tspinEffect.duration) {
        tspinEffect = null;
    }
}
