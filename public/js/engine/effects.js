import { CONFIG } from '../core/config.js';
import { BOARD_WIDTH, BOARD_HEIGHT, CELL_SIZE } from '../ui/layout.js';
import { currentCountdown, getBoardCenterPosition, miniboardSlots, requestMiniboardRedraw } from '../network/online.js';
import { gameState } from '../core/game.js';

// Helper to avoid circular dependency with draw.js
function getTetrominoTypeToIndex(type) {
    const types = Object.keys(CONFIG.TETROMINOES);
    return types.indexOf(type);
}

export let effects = [];
export let textEffects = [];
export let tspinEffect = null;
export let scoreUpdateEffect = null;
export let targetAttackFlashes = new Map(); // attackerId -> flashEndTime

export let orbs = [];
export let activeTimeoutEffect = null; // New: Track the active TimeoutEffect
export let miniboardEntryEffects = []; // New: Track miniboard entry effects

let effectsCanvas;
export let effectsCtx; // Export effectsCtx globally

export function initEffects(canvas) {
    effectsCanvas = canvas;
    effectsCtx = effectsCanvas.getContext('2d');
}

/**
 * Clears all active visual effects from the screen.
 */
export function clearAllEffects() {
    effects.length = 0;
    textEffects.length = 0;
    orbs.length = 0;
    tspinEffect = null;
    scoreUpdateEffect = null;
    targetAttackFlashes.clear();
    activeTimeoutEffect = null; // New: Clear the timeout effect
    miniboardEntryEffects = []; // New: Clear miniboard entry effects
    console.log("Cleared all visual effects.");
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
    if (!CONFIG.effects.enableTextEffects) return; 

    const now = performance.now();
    for (let i = 0; i < textEffects.length; i++) {
        const effect = textEffects[i];
        const progress = (now - effect.startTime) / effect.duration;
        if (progress >= 1) continue;
        
        // ... (rest of drawing code)


        effectsCtx.save();
        effectsCtx.textAlign = 'center';

        let fontSize, fillStyle, strokeStyle, lineWidth, currentY;

        // ... (rest of the switch statement is the same)
        switch (effect.style) {
            case 'milestone':
                fontSize = 60 + Math.sin(progress * Math.PI) * 20; // Pulsing size
                fillStyle = `rgba(0, 243, 255, ${1 - Math.pow(progress, 4)})`; // Cyan fading slowly
                strokeStyle = `rgba(255, 255, 255, ${1 - progress})`;
                lineWidth = 5;
                currentY = effect.initialY; // Stay in center
                break;
            case 'ko':
                fontSize = 70 * (1 - progress * 0.3);
                fillStyle = `rgba(255, 0, 85, ${1 - progress})`;
                strokeStyle = `rgba(255, 255, 255, ${1 - progress})`;
                lineWidth = 4;
                currentY = effect.initialY - (progress * 100);
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
            case 'quad':
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
    }
}




// Orb pool to reduce object creation
const orbPool = [];
const maxOrbPoolSize = 50;

function getOrb() {
    if (orbPool.length > 0) {
        return orbPool.pop();
    }
    return {
        startX: 0,
        startY: 0,
        targetX: 0,
        targetY: 0,
        currentX: 0,
        currentY: 0,
        progress: 0,
        velocity: 0,
        acceleration: 0.003, // 加速度 (減速)
        completed: false,
        arrived: false,
        arrivalTime: 0,
        size: 0,
        alpha: 1,
        trail: [],
        maxTrailLength: 15,
        angle: 0,
        // Pre-allocate trail array to avoid repeated allocations
        trail: []
    };
}

function releaseOrb(orb) {
    if (orbPool.length < maxOrbPoolSize) {
        // Clear trail array
        orb.trail.length = 0;
        orbPool.push(orb);
    }
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
        this.acceleration = CONFIG.effects.orbAcceleration || 0.003; // 加速度 (減速)
        this.completed = false;
        this.arrived = false;
        this.arrivalTime = 0;
        this.size = (CONFIG.effects.orbBaseSize || 15) + Math.random() * (CONFIG.effects.orbRandomSize || 10);
        this.alpha = 1;
        this.trail = [];
        this.maxTrailLength = CONFIG.effects.orbMaxTrailLength || 15;
        this.angle = Math.atan2(targetY - startY, targetX - startX);
    }

    update() {
        if (!this.arrived) {
            this.velocity += this.acceleration;
            this.progress += this.velocity;

            if (this.progress >= 1) {
                this.progress = 1;
                this.arrived = true;
                this.arrivalTime = performance.now();
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
            const elapsed = performance.now() - this.arrivalTime;
            this.alpha = Math.max(0, 1 - elapsed / (CONFIG.effects.orbFadeDuration || 1000));
            this.completed = elapsed > (CONFIG.effects.orbFadeDuration || 1000);
        }

        return !this.completed;
    }

    draw(ctx) {
        // Draw trail with simple circles
        for (let i = 0; i < this.trail.length; i++) {
            const point = this.trail[i];
            ctx.beginPath();
            ctx.arc(point.x, point.y, point.size * 0.4, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 200, ${point.alpha * 0.4})`;
            ctx.fill();
        }

        if (!this.arrived || this.alpha > 0) {
            // Main orb - use a simple circle instead of radial gradient
            ctx.beginPath();
            ctx.arc(this.currentX, this.currentY, this.size * 0.8, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 255, ${this.alpha})`;
            ctx.fill();

            // Glow effect with a simple larger circle
            ctx.beginPath();
            ctx.arc(this.currentX, this.currentY, this.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 200, ${this.alpha * 0.3})`;
            ctx.fill();
        }
    }
}

// --- New: Timeout Effect ---
class TimeoutParticle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.size = Math.random() * 2 + 1;
        this.vx = (Math.random() - 0.5) * 2;
        this.vy = (Math.random() - 0.5) * 2;
        this.alpha = 1;
        this.life = Math.random() * 60 + 30; // frames
        this.color = color;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.alpha -= 1 / this.life;
        return this.alpha > 0;
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

class TimeoutEffect {
    constructor(ctx, message) {
        this.ctx = ctx;
        this.message = message;
        this.startTime = performance.now();
        this.duration = 3000; // 3 seconds
        this.active = true;
        this.particles = [];

        // Create particles for the effect
        for (let i = 0; i < 30; i++) {
            this.particles.push({
                x: Math.random() * this.ctx.canvas.width,
                y: Math.random() * this.ctx.canvas.height,
                size: Math.random() * 2 + 1,
                vx: (Math.random() - 0.5) * 2,
                vy: (Math.random() - 0.5) * 2,
                alpha: 1,
                life: Math.random() * 100 + 50
            });
        }
    }

    update() {
        const now = performance.now();
        const elapsed = now - this.startTime;

        // Update particles
        for (const particle of this.particles) {
            particle.x += particle.vx;
            particle.y += particle.vy;
            particle.alpha = Math.max(0, 1 - (elapsed / this.duration));
        }

        // Update active property based on whether the effect should continue
        this.active = elapsed < this.duration;

        // Return whether the effect should continue
        return this.active;
    }

    draw() {
        if (!this.ctx) return;

        const now = performance.now();
        const elapsed = now - this.startTime;
        const progress = Math.min(1, elapsed / this.duration);

        // Draw particles
        for (const particle of this.particles) {
            if (particle.alpha > 0) {
                this.ctx.save();
                this.ctx.globalAlpha = particle.alpha;
                this.ctx.fillStyle = '#ff5555';
                this.ctx.beginPath();
                this.ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.restore();
            }
        }

        // Draw timeout message
        if (this.message) {
            this.ctx.save();
            this.ctx.font = 'bold 40px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';

            // Calculate position (center of canvas)
            const centerX = this.ctx.canvas.width / 2;
            const centerY = this.ctx.canvas.height / 3;

            // Draw text shadow
            this.ctx.shadowColor = 'black';
            this.ctx.shadowBlur = 10;
            this.ctx.shadowOffsetX = 3;
            this.ctx.shadowOffsetY = 3;

            // Draw the message with fading effect
            const alpha = Math.max(0, 1 - progress);
            this.ctx.fillStyle = `rgba(255, 85, 85, ${alpha})`;
            this.ctx.fillText(this.message, centerX, centerY);

            this.ctx.restore();
        }
    }
}

export function startTimeoutEffect(message) {
    if (effectsCtx && CONFIG.effects.enableTimeoutEffects) { // Check if new effect type should be enabled via config
        activeTimeoutEffect = new TimeoutEffect(effectsCtx, message);
    }
}

export function drawTimeoutEffect() {
    if (activeTimeoutEffect && activeTimeoutEffect.active) {
        activeTimeoutEffect.draw();
    }
}

// --- New: Miniboard Entry Effect ---
class MiniboardEntryEffect {
    constructor(userId, x, y, width, height) {
        this.userId = userId;
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.startTime = performance.now();
        this.lifeTime = 1500; // 1.5秒
        this.particles = [];
        this.particleCount = 30;
        this.active = true;

        for (let i = 0; i < this.particleCount; i++) {
            this.particles.push({
                angle: Math.random() * Math.PI * 2,
                distance: Math.random() * 40 + 20,
                size: Math.random() * 2 + 1,
                speed: Math.random() * 0.02 + 0.01,
                phase: Math.random() * Math.PI * 2,
                opacity: 1
            });
        }
    }

    update(currentTime) {
        if (!this.active) return;
        
        const elapsed = currentTime - this.startTime;
        const progress = Math.min(1, elapsed / this.lifeTime);

        if (progress >= 1) {
            this.active = false;
            // Set isNew to false for the miniboard slot when effect finishes
            const slot = miniboardSlots.find(s => s.userId === this.userId);
            if (slot) {
                slot.isNew = false;
                requestMiniboardRedraw();
            }
            return;
        }

        this.particles.forEach(particle => {
            particle.phase += particle.speed;
            particle.currentDistance = particle.distance * (0.3 + 0.7 * Math.sin(progress * Math.PI));
        });
    }

    draw(currentTime) {
        if (!this.active) return;

        const elapsed = currentTime - this.startTime;
        const progress = Math.min(1, elapsed / this.lifeTime);
        const time = elapsed * 0.001;

        effectsCtx.save();
        effectsCtx.translate(this.x + this.width / 2, this.y + this.height / 2);

        // 中心の光
        const centerSize = 8 + Math.sin(time * 10) * 3;
        const centerAlpha = 0.7 * (1 - progress * 0.5);
        effectsCtx.beginPath();
        effectsCtx.arc(0, 0, centerSize, 0, Math.PI * 2);
        effectsCtx.fillStyle = `rgba(255, 255, 255, ${centerAlpha})`;
        effectsCtx.fill();

        // パーティクル描画
        this.particles.forEach((particle, index) => {
            const angle = particle.angle + particle.phase;
            const distance = particle.currentDistance || particle.distance;
            const px = Math.cos(angle) * distance;
            const py = Math.sin(angle) * distance;

            const particleAlpha = particle.opacity * (0.7 + 0.3 * Math.sin(time * 5 + index));
            const fadeAlpha = particleAlpha * (1 - progress * 0.8);

            effectsCtx.beginPath();
            effectsCtx.arc(px, py, particle.size, 0, Math.PI * 2);
            effectsCtx.fillStyle = `rgba(0, 200, 255, ${fadeAlpha})`;
            effectsCtx.fill();
        });

        effectsCtx.restore();
    }

    isActive() {
        return this.active;
    }
}

export function startMiniboardEntryEffect(userId, x, y, width, height) {
    if (effectsCtx && CONFIG.effects.enableMiniboardEntryEffects) { // New config flag
        miniboardEntryEffects.push(new MiniboardEntryEffect(userId, x, y, width, height));
    }
}

export function drawMiniboardEntryEffects(currentTime) {
    miniboardEntryEffects.forEach(effect => {
        if (effect.isActive()) {
            effect.draw(currentTime);
        }
    });
}

export function createLightOrb(startPos, endPos) {
    if (!CONFIG.effects.enableOrbEffects) return; // Check if orb effects are enabled

    if (!startPos) {
        console.error("createLightOrb: Invalid start position (null or undefined)");
        return;
    }
    if (!endPos) {
        console.error("createLightOrb: Invalid end position (null or undefined)");
        return;
    }

    // Limit orb creation for performance
    if (orbs.length >= (CONFIG.effects.maxOrbs || 20)) {
        return;
    }

    orbs.push(new LightOrb(startPos.x, startPos.y, endPos.x, endPos.y));
}

function drawCountdown(ctx, count) {
    if (!ctx || !count || count === 0) return;

    const centerX = ctx.canvas.width / 2;
    const centerY = ctx.canvas.height / 2;
    const fontSize = Math.max(60, Math.min(ctx.canvas.width * 0.15, ctx.canvas.height * 0.15));

    ctx.font = `bold ${fontSize}px ${CONFIG.ui.fontFamily}`;
    ctx.fillStyle = CONFIG.colors.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Remove shadowBlur as it's very expensive for large text
    ctx.fillText(String(count), centerX, centerY);
    // Draw an outline instead for visibility
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.strokeText(String(count), centerX, centerY);
}

export function drawOrbs() {
    // Simplify orb drawing
    for (let i = 0; i < orbs.length; i++) {
        orbs[i].draw(effectsCtx);
    }
    drawTimeoutEffect(); 
}

// --- Line Clear and Particle Effects ---

// Particle pool to reduce garbage collection
const particlePool = [];
const maxPoolSize = 500;

function getParticle() {
    if (particlePool.length > 0) {
        return particlePool.pop();
    }
    return {
        type: 'particle',
        x: 0,
        y: 0,
        size: 0,
        velocity: { x: 0, y: 0 },
        color: '#FFFFFF',
        startTime: 0,
        duration: 0
    };
}

function releaseParticle(particle) {
    if (particlePool.length < maxPoolSize) {
        // Reset particle properties
        particle.type = 'particle';
        particle.x = 0;
        particle.y = 0;
        particle.size = 0;
        particle.velocity.x = 0;
        particle.velocity.y = 0;
        particle.color = '#FFFFFF';
        particle.startTime = 0;
        particle.duration = 0;
        particlePool.push(particle);
    }
}

function addParticle(props) {
    const particle = getParticle();
    particle.type = 'particle';
    particle.startTime = performance.now();
    particle.duration = props.duration || 500;
    particle.size = props.size || Math.random() * 3 + 2;
    particle.velocity = {
        x: props.velocity?.x || (Math.random() - 0.5) * 8,
        y: props.velocity?.y || (Math.random() - 0.5) * 8 - 3, // Move upwards initially
    };
    particle.color = props.color || '#FFFFFF';
    particle.x = props.x || 0;
    particle.y = props.y || 0;

    effects.push(particle);
}

export function drawParticles() {
    const now = performance.now();
    for (let i = 0; i < effects.length; i++) {
        const effect = effects[i];
        if (effect.type === 'particle') {
            const progress = (now - effect.startTime) / effect.duration;
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
    }
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

    // Add particles based on clear type with performance limit
    if (CONFIG.effects.enableParticleEffects) {
        const maxParticlesPerClear = CONFIG.effects.maxParticlesPerClear || 100;
        let totalParticles = 0;

        rows.forEach(row => {
            const y = (row - startRow) * CELL_SIZE + CELL_SIZE / 2;
            let particleCount = 0;
            let particleColors = ['#FFFFFF'];

            switch (clearType) {
                case 'quad':
                    particleColors = [CONFIG.colors.tetromino[1]]; 
                    particleCount = CONFIG.effects.particleCountQuad || 40;
                    break;
                case 'tspin':
                    particleCount = CONFIG.effects.particleCountTspin || 30;
                    particleColors = ['#FF00FF', '#FFFFFF'];
                    break;
                case 'b2b':
                    particleCount = CONFIG.effects.particleCountB2B || 20;
                    // Rainbow colors for B2B
                    particleColors = ['#FF0000', '#FF7F00', '#FFFF00', '#00FF00', '#0000FF', '#4B0082', '#9400D3'];
                    break;
                case 'combo':
                    particleCount = CONFIG.effects.particleCountCombo || 15;
                    particleColors = ['#FFFF00'];
                    break;
                default: // single, double, triple
                    particleCount = Math.min(rows.length * (CONFIG.effects.particleCountDefaultMultiplier || 5), 20);
            }

            // Limit total particles to prevent performance issues
            const particlesToAdd = Math.min(particleCount, maxParticlesPerClear - totalParticles);

            for (let i = 0; i < particlesToAdd; i++) {
                if (totalParticles >= maxParticlesPerClear) break;

                addParticle({
                    x: Math.random() * BOARD_WIDTH + offset.x,
                    y: y + offset.y,
                    color: particleColors[Math.floor(Math.random() * particleColors.length)],
                    duration: (CONFIG.effects.particleDurationBase || 400) + Math.random() * (CONFIG.effects.particleDurationRandom || 300),
                });
                totalParticles++;
            }
        });
    }
}

export function triggerTspinEffect(x, y) {
    if (!CONFIG.effects.enableTextEffects) return; // Check if text effects are enabled

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
    if (!CONFIG.effects.enableParticleEffects) return; // Check if particle effects are enabled

    const particleCount = CONFIG.effects.lockPieceParticleCount || 5;
    const offset = getMainBoardOffset();
    for (let i = 0; i < particleCount; i++) {
        addParticle({
            x: x + offset.x,
            y: y + offset.y,
            color,
            duration: 300,
            velocity: {
                x: (Math.random() - 0.5) * (CONFIG.effects.lockPieceParticleVelocityFactor || 4),
                y: (Math.random() - 0.5) * (CONFIG.effects.lockPieceParticleVelocityFactor || 4)
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

// Appearance effect for new piece spawning
export function triggerPieceAppearanceEffect(piece) {
    if (!CONFIG.effects.enableAppearanceEffects) return; // Check if appearance effects are enabled

    const shape = piece.shape[0]; // Use the initial rotation
    const offset = getMainBoardOffset();
    const startRow = CONFIG.board.rows - CONFIG.board.visibleRows;

    // Create particles for each block in the piece
    const particleCountPerBlock = CONFIG.effects.appearanceParticleCount || 6;

    shape.forEach(([dx, dy]) => {
        const x = (piece.x + dx) * CELL_SIZE + CELL_SIZE / 2;
        const y = (piece.y + dy - startRow) * CELL_SIZE + CELL_SIZE / 2;

        // Position in canvas coordinates
        const canvasX = x + offset.x;
        const canvasY = y + offset.y;

        // Create particles around the block position
        for (let i = 0; i < particleCountPerBlock; i++) {
            // Create particles that move toward the center
            const angle = Math.random() * Math.PI * 2;
            const distance = (Math.random() * 10) + 5; // Random distance from center
            const targetX = canvasX;
            const targetY = canvasY;
            const startX = targetX + Math.cos(angle) * distance;
            const startY = targetY + Math.sin(angle) * distance;

            // Get particle color based on piece type
            const typeIndex = tetrominoTypeToIndex(piece.type);
            const color = CONFIG.colors.tetromino[typeIndex + 1] || "#FFFFFF";

            addParticle({
                x: startX,
                y: startY,
                color: color,
                duration: (CONFIG.effects.appearanceDuration || 500) + Math.random() * 200,
                velocity: {
                    x: (targetX - startX) / 10, // Move towards center
                    y: (targetY - startY) / 10  // Move towards center
                },
            });
        }
    });

    // Calculate the bounding box for the piece
    const minX = Math.min(...shape.map(([x, y]) => x));
    const maxX = Math.max(...shape.map(([x, y]) => x));
    const minY = Math.min(...shape.map(([x, y]) => y));
    const maxY = Math.max(...shape.map(([x, y]) => y));

    // Add a brief flash at the piece location
    effects.push({
        type: 'pieceAppearance',
        startTime: performance.now(),
        duration: CONFIG.effects.appearanceFlashDuration || 300,
        x: (piece.x + minX) * CELL_SIZE + offset.x,
        y: (piece.y + minY - startRow) * CELL_SIZE + offset.y,
        width: (maxX - minX + 1) * CELL_SIZE,
        height: (maxY - minY + 1) * CELL_SIZE,
        color: CONFIG.colors.tetromino[tetrominoTypeToIndex(piece.type) + 1] || "#FFFFFF"
    });
}

// Combo chain effect
export function triggerComboEffect(comboCount) {
    if (!CONFIG.effects.enableComboEffects) return;

    // Add a text effect for combo
    if (comboCount >= 2) {
        const comboText = `${comboCount} COMBO!`;
        const offset = getMainBoardOffset();
        const x = offset.x + BOARD_WIDTH / 2;
        const y = offset.y + BOARD_HEIGHT / 3;

        // Add a special combo text effect with enhanced styling
        textEffects.push({
            text: comboText,
            style: 'combo',
            duration: (CONFIG.effects.comboTextDuration || 1000) * (1 + comboCount * 0.1), // Longer for higher combos
            startTime: performance.now(),
            x: x,
            y: y,
            initialY: y,
        });
    }
}

// Perfect clear celebration effect
export function triggerPerfectClearEffect() {
    if (!CONFIG.effects.enablePerfectClearEffects) return;

    const offset = getMainBoardOffset();
    const centerX = offset.x + BOARD_WIDTH / 2;
    const centerY = offset.y + BOARD_HEIGHT / 2;

    // Create a large burst of particles
    const particleCount = CONFIG.effects.perfectClearParticleCount || 100;
    const colors = ['#FFD700', '#FFA500', '#FF0000', '#00FF00', '#0000FF', '#4B0082', '#9400D3'];

    for (let i = 0; i < particleCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * 100;
        const targetX = centerX + Math.cos(angle) * distance;
        const targetY = centerY + Math.sin(angle) * distance;

        addParticle({
            x: centerX,
            y: centerY,
            color: colors[Math.floor(Math.random() * colors.length)],
            duration: (CONFIG.effects.perfectClearDuration || 1500) + Math.random() * 500,
            velocity: {
                x: (targetX - centerX) / 20,
                y: (targetY - centerY) / 20
            },
        });
    }

    // Add special text effect
    addTextEffect('PERFECT CLEAR!', {
        style: 'ko',
        duration: CONFIG.effects.perfectClearTextDuration || 2000,
        x: centerX,
        y: centerY - 50
    });

    // Add a screen-wide flash effect
    effects.push({
        type: 'perfectClearFlash',
        startTime: performance.now(),
        duration: CONFIG.effects.perfectClearFlashDuration || 800,
        color: '#FFFFFF'
    });
}

// Draw perfect clear flash effect
export function drawPerfectClearEffects() {
    if (!CONFIG.effects.enablePerfectClearEffects) return;

    const now = performance.now();
    for (let i = effects.length - 1; i >= 0; i--) {
        const effect = effects[i];
        if (effect.type === 'perfectClearFlash') {
            const progress = (now - effect.startTime) / effect.duration;
            if (progress < 1) {
                effectsCtx.save();
                const opacity = (1 - progress) * 0.7 * Math.sin(progress * Math.PI); // Pulsing effect
                effectsCtx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
                effectsCtx.fillRect(0, 0, effectsCtx.canvas.width, effectsCtx.canvas.height);
                effectsCtx.restore();
            } else {
                effects.splice(i, 1); // Remove finished effect
            }
        }
    }
}

// Attack received effect - flash when receiving attack
export function triggerReceivedAttackEffect() {
    if (!CONFIG.effects.enableAttackEffects) return;

    effects.push({
        type: 'receivedAttackFlash',
        startTime: performance.now(),
        duration: CONFIG.effects.attackFlashDuration || 250,
        color: '#FF0000'
    });
}

// Draw received attack effects
export function drawReceivedAttackEffects() {
    if (!CONFIG.effects.enableAttackEffects) return;

    const now = performance.now();
    for (let i = effects.length - 1; i >= 0; i--) {
        const effect = effects[i];
        if (effect.type === 'receivedAttackFlash') {
            const progress = (now - effect.startTime) / effect.duration;
            if (progress < 1) {
                effectsCtx.save();
                const opacity = (1 - progress) * 0.4;
                effectsCtx.fillStyle = `rgba(255, 0, 0, ${opacity})`;
                effectsCtx.fillRect(0, 0, effectsCtx.canvas.width, effectsCtx.canvas.height);
                effectsCtx.restore();
            } else {
                effects.splice(i, 1); // Remove finished effect
            }
        }
    }
}

export function drawPieceAppearanceEffects() {
    if (!CONFIG.effects.enableAppearanceEffects) return;

    const now = performance.now();
    for (let i = effects.length - 1; i >= 0; i--) {
        const effect = effects[i];
        if (effect.type === 'pieceAppearance') {
            const progress = (now - effect.startTime) / effect.duration;
            if (progress < 1) {
                effectsCtx.save();
                effectsCtx.globalAlpha = (1 - progress) * 0.6; // Fade out
                effectsCtx.fillStyle = effect.color;
                effectsCtx.fillRect(effect.x, effect.y, effect.width, effect.height);
                effectsCtx.restore();
            } else {
                effects.splice(i, 1); // Remove finished effect
            }
        }
    }
}

export function triggerTargetAttackFlash(attackerId) {
    targetAttackFlashes.set(attackerId, performance.now() + 200); // 200ms flash
}



export function clearPieceAppearanceEffects() {
    for (let i = effects.length - 1; i >= 0; i--) {
        if (effects[i].type === 'pieceAppearance' || effects[i].type === 'receivedAttackFlash') {
            effects.splice(i, 1);
        }
    }
}

export function updateEffects() {
    const now = performance.now();

    // Limit the number of active effects to prevent performance degradation
    if (effects.length > 500) {
        effects.splice(0, effects.length - 500);
    }
    if (textEffects.length > 50) {
        textEffects.splice(0, textEffects.length - 50);
    }

    // Update active effects
    for (let i = effects.length - 1; i >= 0; i--) {
        const e = effects[i];
        if (now - e.startTime >= e.duration) {
            // Return particle to pool if it's a particle effect
            if (e.type === 'particle') {
                releaseParticle(e);
            }
            effects.splice(i, 1);
        } else if (e.type === 'particle') {
            e.x += e.velocity.x;
            e.y += e.velocity.y;
            e.velocity.y += CONFIG.effects.particleGravity || 0.1; // Gravity
            e.velocity.x *= CONFIG.effects.particleFriction || 0.98; // Friction
        }
    }

    // Update text effects
    for (let i = textEffects.length - 1; i >= 0; i--) {
        if (now - textEffects[i].startTime >= textEffects[i].duration) {
            textEffects.splice(i, 1);
        }
    }

    // Update orbs
    for (let i = orbs.length - 1; i >= 0; i--) {
        if (!orbs[i].update()) {
            releaseOrb(orbs[i]);
            orbs.splice(i, 1);
        }
    }

    if (tspinEffect && now - tspinEffect.startTime >= tspinEffect.duration) {
        tspinEffect = null;
    }

    if (scoreUpdateEffect && now - scoreUpdateEffect.startTime >= scoreUpdateEffect.duration) {
        scoreUpdateEffect = null;
    }

    if (activeTimeoutEffect && !activeTimeoutEffect.update()) { // Update timeout effect
        activeTimeoutEffect = null;
    }

    // Update miniboard entry effects - logic is now handled only here
    for (let i = miniboardEntryEffects.length - 1; i >= 0; i--) {
        const effect = miniboardEntryEffects[i];
        effect.update(now);
        if (!effect.isActive()) {
            miniboardEntryEffects.splice(i, 1);
        }
    }

    // Clean up expired flashes
    for (const [key, value] of targetAttackFlashes.entries()) {
        if (now > value) {
            targetAttackFlashes.delete(key);
        }
    }
}

export function drawAllEffects() {
    if (!effectsCtx) return;
    
    // Clear the canvas once at the start of drawing
    effectsCtx.clearRect(0, 0, effectsCanvas.width, effectsCanvas.height); 

    const now = performance.now();
    drawTextEffects();
    drawParticles();
    drawOrbs(); 
    drawLineClearEffects();
    drawTspinEffect();
    drawPerfectClearEffects();
    drawReceivedAttackEffects();
    drawPieceAppearanceEffects();
    drawTargetAttackFlashes();
    drawMiniboardEntryEffects(now);
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

export function drawLineClearEffects() {
    const now = performance.now();
    effects.forEach(effect => {
        const progress = (now - effect.startTime) / effect.duration;
        if (progress >= 1) return; // Skip finished effects

        const alpha = Math.max(0, 1 - progress);

        if (effect.type === 'lineClear') {
            effectsCtx.save();
            effectsCtx.fillStyle = `rgba(255, 255, 0, ${alpha * CONFIG.effects.lineClearEffectOpacity})`;
            const startRow = CONFIG.board.rows - CONFIG.board.visibleRows;
            const offset = getMainBoardOffset();
            effect.rows.forEach(row => {
                const y = (row - startRow) * CELL_SIZE + offset.y;
                if (y >= offset.y) effectsCtx.fillRect(offset.x, y, BOARD_WIDTH, CELL_SIZE);
            });
            effectsCtx.restore();
        }
    });
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