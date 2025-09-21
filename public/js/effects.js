import { CONFIG } from './config.js';
import { BOARD_WIDTH, BOARD_HEIGHT, CELL_SIZE } from './layout.js';

export let effects = [];
export let textEffects = [];
export let tspinEffect = null;
export let scoreUpdateEffect = null;
export let targetAttackFlashes = new Map(); // attackerId -> flashEndTime

export let orbs = [];
export let effectCanvas = null;
export let effectCtx = null;

export function initEffects(canvas) {
    effectCanvas = canvas;
    if (!effectCanvas) return;
    effectCtx = canvas.getContext('2d');
    effectCanvas.width = BOARD_WIDTH;
    effectCanvas.height = BOARD_HEIGHT;
}

// --- Text Effect ---
export function addTextEffect(text, { style = 'default', duration = 500, x = BOARD_WIDTH / 2, y = BOARD_HEIGHT / 2 } = {}) {
    textEffects.push({
        text,
        style,
        duration,
        startTime: performance.now(),
        x,
        y,
        initialY: y,
    });
}

export function drawTextEffects(ctx) {
    const now = performance.now();
    textEffects.forEach(effect => {
        const progress = (now - effect.startTime) / effect.duration;
        if (progress >= 1) return; // Should be filtered out by updateEffects, but good to check

        ctx.save();
        ctx.font = `bold ${30 * (1 - progress * 0.5)}px Arial`; // Example: fading and shrinking
        ctx.textAlign = 'center';
        ctx.fillStyle = `rgba(255, 255, 255, ${1 - progress})`;
        ctx.strokeStyle = `rgba(0, 0, 0, ${1 - progress})`;
        ctx.lineWidth = 2;

        const currentY = effect.initialY - (progress * 50); // Example: move upwards

        ctx.fillText(effect.text, effect.x, currentY);
        ctx.strokeText(effect.text, effect.x, currentY);
        ctx.restore();
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
        this.acceleration = 0.008; // 加速度
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
        if (this.trail.length > 1 && !this.arrived) {
            for (let i = 0; i < this.trail.length - 1; i++) {
                const point1 = this.trail[i];
                const point2 = this.trail[i + 1];
                
                ctx.beginPath();
                ctx.moveTo(point1.x, point1.y);
                ctx.lineTo(point2.x, point2.y);
                
                ctx.strokeStyle = `rgba(255, 255, 200, ${point1.alpha})`;
                ctx.lineWidth = 3;
                ctx.lineCap = 'round';
                ctx.stroke();
            }
        }

        if (!this.arrived || this.alpha > 0) {
            ctx.beginPath();
            ctx.arc(this.currentX, this.currentY, this.size * 1.8, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 255, ${this.alpha * 0.4})`;
            ctx.fill();
            
            ctx.beginPath();
            ctx.arc(this.currentX, this.currentY, this.size * 1.2, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 200, ${this.alpha * 0.7})`;
            ctx.fill();
            
            ctx.beginPath();
            ctx.arc(this.currentX, this.currentY, this.size * 0.6, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 255, ${this.alpha})`;
            ctx.fill();
            
            ctx.beginPath();
            ctx.arc(this.currentX - this.size/4, this.currentY - this.size/4, this.size/3, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 255, ${this.alpha * 0.9})`;
            ctx.fill();
        }
    }
}

export function createLightOrb(startPos, endPos) {
    if (!startPos || !endPos) {
        // console.error("createLightOrb: Invalid start or end position");
        return;
    }
    // console.log(`Creating LightOrb from`, startPos, `to`, endPos);
    orbs.push(new LightOrb(startPos.x, startPos.y, endPos.x, endPos.y));
    // console.log(`Orbs count: ${orbs.length}`);
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

export function triggerLineClearEffect(rows, clearType) {
    const duration = 300;
    const startRow = CONFIG.board.rows - CONFIG.board.visibleRows;

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
                x: Math.random() * BOARD_WIDTH,
                y: y,
                color: particleColors[Math.floor(Math.random() * particleColors.length)],
                duration: 400 + Math.random() * 300,
            });
        }
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
        addParticle({
            x,
            y,
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

export function drawTspinEffect(ctx) {
    if (!tspinEffect) return;

    const now = performance.now();
    const progress = (now - tspinEffect.startTime) / tspinEffect.duration;

    if (progress >= 1) return; // Should be nullified by updateEffects, but good to check

    ctx.save();
    ctx.font = `bold ${40 * (1 - progress * 0.5)}px Arial`;
    ctx.textAlign = 'center';
    ctx.fillStyle = `rgba(255, 255, 0, ${1 - progress})`; // Yellow fading out
    ctx.strokeStyle = `rgba(0, 0, 0, ${1 - progress})`;
    ctx.lineWidth = 3;

    const currentY = tspinEffect.y - (progress * 30); // Move upwards slightly

    ctx.fillText('T-SPIN!', tspinEffect.x, currentY);
    ctx.strokeText('T-SPIN!', tspinEffect.x, currentY);
    ctx.restore();
}

export function drawTargetAttackFlashes(ctx) {
    const now = performance.now();
    targetAttackFlashes.forEach((endTime, attackerId) => {
        const duration = 200; // Flash duration (same as in triggerTargetAttackFlash)
        const startTime = endTime - duration;
        const progress = (now - startTime) / duration;

        if (progress < 1) {
            ctx.save();
            ctx.fillStyle = `rgba(255, 0, 0, ${0.5 * (1 - progress)})`; // Red fading out
            ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            ctx.restore();
        }
    });
}