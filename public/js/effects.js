
import { CONFIG } from './config.js';

export let effects = [];
export let tspinEffect = null;

export let scoreUpdateEffect = null;

export function triggerLineClearEffect(rows) {
    effects.push({
        type: 'lineClear',
        rows,
        startTime: performance.now(),
        duration: CONFIG.effects.lineClearDuration
    });
}

export function triggerTspinEffect(x, y) {
    tspinEffect = {
        type: 'tspin',
        x,
        y,
        startTime: performance.now(),
        duration: CONFIG.effects.tspinEffectDuration
    };
}

export function triggerLockPieceEffect(x, y, color) {
    const particleCount = 5;
    for (let i = 0; i < particleCount; i++) {
        effects.push({
            type: 'particle',
            x,
            y,
            color,
            size: Math.random() * 3 + 2, // 2px to 5px
            velocity: {
                x: (Math.random() - 0.5) * 4,
                y: (Math.random() - 0.5) * 4
            },
            startTime: performance.now(),
            duration: 300 // 300ms lifespan
        });
    }
}

export function triggerScoreUpdateEffect() {
    scoreUpdateEffect = {
        startTime: performance.now(),
        duration: 200 // 200ms duration for the pulse effect
    };
}

export function updateEffects() {
    const now = performance.now();
    
    // Filter out expired effects
    effects = effects.filter(e => now - e.startTime < e.duration);
    
    // Update active effects
    effects.forEach(e => {
        if (e.type === 'particle') {
            e.x += e.velocity.x;
            e.y += e.velocity.y;
            e.velocity.y += 0.1; // Gravity
        }
    });

    if (tspinEffect && now - tspinEffect.startTime >= tspinEffect.duration) {
        tspinEffect = null;
    }

    if (scoreUpdateEffect && now - scoreUpdateEffect.startTime >= scoreUpdateEffect.duration) {
        scoreUpdateEffect = null;
    }
}
