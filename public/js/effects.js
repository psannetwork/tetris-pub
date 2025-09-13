import { CONFIG } from './config.js';

export let effects = [];
export let tspinEffect = null;
export let scoreUpdateEffect = null;

export let orbs = [];
export let effectCanvas = null;
export let effectCtx = null;

export function initEffects(canvas) {
    effectCanvas = canvas;
    if (!effectCanvas) return;
    effectCtx = canvas.getContext('2d');
    effectCanvas.width = 1172;
    effectCanvas.height = 593.5;
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
}