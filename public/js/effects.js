import { CONFIG } from './config.js';
import { BOARD_WIDTH, BOARD_HEIGHT, CELL_SIZE } from './layout.js';
import { getMainBoardOffset } from './draw.js';
import { currentCountdown } from './online.js';

export let effects = [];
export let textEffects = [];
export let tspinEffect = null;
export let scoreUpdateEffect = null;
export let targetAttackFlashes = new Map(); // attackerId -> flashEndTime

export let orbs = [];

let effectsCanvas;
export let effectsCtx;

export function initEffects(canvas) {
    effectsCanvas = canvas;
    effectsCtx = effectsCanvas.getContext('2d');
}

// --- Text Effect ---
export function addTextEffect(text, { style = 'default', duration = 1500, x, y } = {}) {
    const offset = getMainBoardOffset();
    const globalX = x !== undefined ? x : offset.x + BOARD_WIDTH / 2;
    const globalY = y !== undefined ? y : offset.y + BOARD_HEIGHT / 2;

    textEffects.push({
        text,
        style,
        duration,
        startTime: performance.now(),
        x: globalX,
        y: globalY,
        initialY: globalY,
    });
}

export function drawTextEffects() {
    const now = performance.now();
    textEffects.forEach(effect => {
        const progress = (now - effect.startTime) / effect.duration;
        if (progress >= 1) return;

        effectsCtx.save();
        effectsCtx.textAlign = 'center';
        
        let fontSize, fillStyle, strokeStyle, lineWidth, currentY;

        // ... (rest of the switch statement is the same)
        switch (effect.style) {
            case 'ko':
                fontSize = 50 * (1 - progress * 0.5);
                fillStyle = `rgba(255, 0, 0, ${1 - progress})`;
                strokeStyle = `rgba(255, 255, 255, ${1 - progress})`;
                lineWidth = 4;
                currentY = effect.initialY - (progress * 70);
                break;
            case 'b2b':
                fontSize = 35 * (1 - progress * 0.5);
                fillStyle = `rgba(255, 165, 0, ${1 - progress})`;
                strokeStyle = `rgba(0, 0, 0, ${1 - progress})`;
                lineWidth = 3;
                currentY = effect.initialY - (progress * 60);
                break;
            case 'tspin':
                fontSize = 35 * (1 - progress * 0.5);
                fillStyle = `rgba(148, 0, 211, ${1 - progress})`;
                strokeStyle = `rgba(255, 255, 255, ${1 - progress})`;
                lineWidth = 3;
                currentY = effect.initialY - (progress * 60);
                break;
            case 'tetris':
                fontSize = 40 * (1 - progress * 0.5);
                fillStyle = `rgba(0, 255, 255, ${1 - progress})`;
                strokeStyle = `rgba(0, 0, 0, ${1 - progress})`;
                lineWidth = 3;
                currentY = effect.initialY - (progress * 65);
                break;
            case 'combo':
                fontSize = 30 * (1 - progress * 0.5);
                fillStyle = `rgba(255, 255, 0, ${1 - progress})`;
                strokeStyle = `rgba(0, 0, 0, ${1 - progress})`;
                lineWidth = 2;
                currentY = effect.initialY - (progress * 50);
                break;
            default:
                fontSize = 30 * (1 - progress * 0.5);
                fillStyle = `rgba(255, 255, 255, ${1 - progress})`;
                strokeStyle = `rgba(0, 0, 0, ${1 - progress})`;
                lineWidth = 2;
                currentY = effect.initialY - (progress * 50);
                break;
        }

        effectsCtx.font = `bold ${fontSize}px Arial`;
        effectsCtx.fillStyle = fillStyle;
        effectsCtx.strokeStyle = strokeStyle;
        effectsCtx.lineWidth = lineWidth;

        effectsCtx.fillText(effect.text, effect.x, currentY);
        effectsCtx.strokeText(effect.text, effect.x, currentY);
        effectsCtx.restore();
    });
}




// 光玉クラス
class LightOrb {
    constructor(startX, startY, targetX, targetY) {
        this.startX = startX;
        this.startY = startY;
        this.targetX = targetX;
        this.targetY = targetY;
        this.currentX = startX;
        this.currentY = startY;
        this.progress = 0;
        this.velocity = 0;
        this.acceleration = 0.003; // 加速度 (減速)
        this.completed = false;
        this.arrived = false;
        this.arrivalTime = 0;
        this.size = 15 + Math.random() * 10;
        this.alpha = 1;
        this.trail = [];
        this.maxTrailLength = 15;
        this.angle = Math.atan2(targetY - startY, targetX - startX);
    }

    update() {
        if (!this.arrived) {
            this.velocity += this.acceleration;
            this.progress += this.velocity;
            
            if (this.progress >= 1) {
                this.progress = 1;
                this.arrived = true;
                this.arrivalTime = Date.now();
                this.velocity = 0;
            }

            const easeProgress = 1 - Math.pow(1 - this.progress, 3);
            this.currentX = this.startX + (this.targetX - this.startX) * easeProgress;
            this.currentY = this.startY + (this.targetY - this.startY) * easeProgress;

            this.trail.push({ 
                x: this.currentX, 
                y: this.currentY,
                size: this.size * (1 - this.progress),
                alpha: 0.7 * (1 - this.progress)
            });
            if (this.trail.length > this.maxTrailLength) {
                this.trail.shift();
            }
        } else {
            const elapsed = Date.now() - this.arrivalTime;
            this.alpha = Math.max(0, 1 - elapsed / 1000);
            this.completed = elapsed > 1000;
        }

        return !this.completed;
    }

    draw(ctx) {
        // Draw trail as fading circles
        for (let i = 0; i < this.trail.length; i++) {
            const point = this.trail[i];
            ctx.beginPath();
            ctx.arc(point.x, point.y, point.size * 0.5, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 200, ${point.alpha * 0.5})`;
            ctx.fill();
        }

        if (!this.arrived || this.alpha > 0) {
            // Main orb with radial gradient
            const gradient = ctx.createRadialGradient(
                this.currentX, this.currentY, 0,
                this.currentX, this.currentY, this.size
            );
            gradient.addColorStop(0, `rgba(255, 255, 255, ${this.alpha})`);
            gradient.addColorStop(0.5, `rgba(255, 255, 200, ${this.alpha * 0.7})`);
            gradient.addColorStop(1, `rgba(255, 255, 150, 0)`);

            ctx.beginPath();
            ctx.arc(this.currentX, this.currentY, this.size, 0, Math.PI * 2);
            ctx.fillStyle = gradient;
            ctx.fill();

            // Small highlight
            ctx.beginPath();
            ctx.arc(this.currentX - this.size / 4, this.currentY - this.size / 4, this.size / 3, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 255, ${this.alpha * 0.9})`;
            ctx.fill();
        }
    }
}

export function createLightOrb(startPos, endPos) {
    if (!startPos) {
        console.error("createLightOrb: Invalid start position (null or undefined)");
        return;
    }
    if (!endPos) {
        console.error("createLightOrb: Invalid end position (null or undefined)");
        return;
    }
    orbs.push(new LightOrb(startPos.x, startPos.y, endPos.x, endPos.y));
}

function drawCountdown(ctx, count) {
    if (!ctx || !count || count === 0) return;

    // Calculate center position using canvas dimensions
    const centerX = ctx.canvas.width / 2;
    const centerY = ctx.canvas.height / 2;

    // Calculate dynamic font size based on canvas size (similar to 5em in the original HTML)
    const fontSize = Math.max(60, Math.min(ctx.canvas.width * 0.15, ctx.canvas.height * 0.15));

    // Set text properties
    ctx.font = `bold ${fontSize}px ${CONFIG.ui.fontFamily}`;
    ctx.fillStyle = CONFIG.colors.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Draw text shadow for better visibility
    ctx.shadowColor = 'black';
    ctx.shadowBlur = 15;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 3;

    // Draw the countdown text
    ctx.fillText(String(count), centerX, centerY);

    // Reset shadow settings
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
}

export function drawOrbs() {
    // Draw countdown if active
    if (currentCountdown !== null && currentCountdown !== '' && currentCountdown !== 0) {
        drawCountdown(effectsCtx, currentCountdown);
    }

    orbs.forEach(orb => orb.draw(effectsCtx));
}

// --- Line Clear and Particle Effects ---

function addParticle(props) {
    const defaults = {
        type: 'particle',
        startTime: performance.now(),
        duration: 500,
        size: Math.random() * 3 + 2,
        velocity: {
            x: (Math.random() - 0.5) * 8,
            y: (Math.random() - 0.5) * 8 - 3, // Move upwards initially
        },
        color: '#FFFFFF',
    };
    effects.push({ ...defaults, ...props });
}

export function drawParticles() {
    effects.forEach(effect => {
        if (effect.type === 'particle') {
            const progress = (performance.now() - effect.startTime) / effect.duration;
            if (progress < 1) {
                effectsCtx.save();
                effectsCtx.globalAlpha = 1 - progress;
                effectsCtx.fillStyle = effect.color;
                effectsCtx.beginPath();
                effectsCtx.arc(effect.x, effect.y, effect.size * (1 - progress * 0.5), 0, Math.PI * 2);
                effectsCtx.fill();
                effectsCtx.restore();
            }
        }
    });
}

export function triggerLineClearEffect(rows, clearType) {
    const duration = 300;
    const startRow = CONFIG.board.rows - CONFIG.board.visibleRows;
    const offset = getMainBoardOffset();

    // Base line clear flash
    effects.push({
        type: 'lineClear',
        rows,
        startTime: performance.now(),
        duration: CONFIG.effects.lineClearDuration,
        style: clearType, // Pass style for special rendering (e.g., 'b2b')
    });

    // Add particles based on clear type
    rows.forEach(row => {
        const y = (row - startRow) * CELL_SIZE + CELL_SIZE / 2;
        let particleCount = 0;
        let particleColors = ['#FFFFFF'];

        switch (clearType) {
            case 'tetris':
                particleCount = 40;
                break;
            case 'tspin':
                particleCount = 30;
                particleColors = ['#FF00FF', '#FFFFFF'];
                break;
            case 'b2b':
                particleCount = 20;
                // Rainbow colors for B2B
                particleColors = ['#FF0000', '#FF7F00', '#FFFF00', '#00FF00', '#0000FF', '#4B0082', '#9400D3'];
                break;
            case 'combo':
                 particleCount = 15;
                 particleColors = ['#FFFF00'];
                 break;
            default: // single, double, triple
                particleCount = rows.length * 5;
        }

        for (let i = 0; i < particleCount; i++) {
            addParticle({
                x: Math.random() * BOARD_WIDTH + offset.x,
                y: y + offset.y,
                color: particleColors[Math.floor(Math.random() * particleColors.length)],
                duration: 400 + Math.random() * 300,
            });
        }
    });
}

export function triggerTspinEffect(x, y) {
    const offset = getMainBoardOffset();
    tspinEffect = {
        type: 'tspin',
        x: x + offset.x,
        y: y + offset.y,
        startTime: performance.now(),
        duration: CONFIG.effects.tspinEffectDuration
    };
}

export function triggerLockPieceEffect(x, y, color) {
    const particleCount = 5;
    const offset = getMainBoardOffset();
    for (let i = 0; i < particleCount; i++) {
        addParticle({
            x: x + offset.x,
            y: y + offset.y,
            color,
            duration: 300,
             velocity: {
                x: (Math.random() - 0.5) * 4,
                y: (Math.random() - 0.5) * 4
            },
        });
    }
}

export function triggerScoreUpdateEffect() {
    scoreUpdateEffect = {
        startTime: performance.now(),
        duration: 200 // 200ms duration for the pulse effect
    };
}

export function triggerTargetAttackFlash(attackerId) {
    targetAttackFlashes.set(attackerId, performance.now() + 200); // 200ms flash
}



export function updateEffects() {
    const now = performance.now();
    
    // Filter out expired effects
    effects = effects.filter(e => now - e.startTime < e.duration);
    textEffects = textEffects.filter(e => now - e.startTime < e.duration);
    
    // Update active effects
    effects.forEach(e => {
        if (e.type === 'particle') {
            e.x += e.velocity.x;
            e.y += e.velocity.y;
            e.velocity.y += CONFIG.effects.particleGravity; // Gravity
            e.velocity.x *= CONFIG.effects.particleFriction; // Friction
        }
    });

    // Update orbs
    for (let i = orbs.length - 1; i >= 0; i--) {
        if (!orbs[i].update()) {
            orbs.splice(i, 1);
        }
    }

    if (tspinEffect && now - tspinEffect.startTime >= tspinEffect.duration) {
        tspinEffect = null;
    }

    if (scoreUpdateEffect && now - scoreUpdateEffect.startTime >= scoreUpdateEffect.duration) {
        scoreUpdateEffect = null;
    }

    // Clean up expired flashes
    for (const [key, value] of targetAttackFlashes.entries()) {
        if (now > value) {
            targetAttackFlashes.delete(key);
        }
    }
}

export function drawTspinEffect() {
    if (!tspinEffect) return;

    const now = performance.now();
    const progress = (now - tspinEffect.startTime) / tspinEffect.duration;

    if (progress >= 1) return;

    effectsCtx.save();
    effectsCtx.font = `bold ${40 * (1 - progress * 0.5)}px Arial`;
    effectsCtx.textAlign = 'center';
    effectsCtx.fillStyle = `rgba(255, 255, 0, ${1 - progress})`;
    effectsCtx.strokeStyle = `rgba(0, 0, 0, ${1 - progress})`;
    effectsCtx.lineWidth = 3;

    const currentY = tspinEffect.y - (progress * 30);

    effectsCtx.fillText('T-SPIN!', tspinEffect.x, currentY);
    effectsCtx.strokeText('T-SPIN!', tspinEffect.x, currentY);
    effectsCtx.restore();
}

export function drawTargetAttackFlashes() {
    const now = performance.now();
    targetAttackFlashes.forEach((endTime, attackerId) => {
        const duration = 200;
        const startTime = endTime - duration;
        const progress = (now - startTime) / duration;

        if (progress < 1) {
            effectsCtx.save();
            effectsCtx.fillStyle = `rgba(255, 0, 0, ${0.5 * (1 - progress)})`;
            effectsCtx.fillRect(0, 0, effectsCtx.canvas.width, effectsCtx.canvas.height);
            effectsCtx.restore();
        }
    });
}