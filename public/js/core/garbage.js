import { CONFIG } from './config.js';

export let attackBarSegments = [];
export const MAX_ATTACK = 20;
export const PHASE1 = 2000;
export const PHASE2 = 5000;
export const PHASE3 = 8000;
export const PHASE4 = 12000;

export function getAttackBarSum() {
  return attackBarSegments.reduce((sum, segment) => sum + segment.value, 0);
}

export function addAttackBar(value) {
    attackBarSegments.push({
        value: value,
        timestamp: performance.now()
    });
}

export function removeAttackBar(value) {
    let remaining = value;
    while (remaining > 0 && attackBarSegments.length > 0) {
        const segment = attackBarSegments[0];
        if (segment.value <= remaining) {
            remaining -= segment.value;
            attackBarSegments.shift();
        } else {
            segment.value -= remaining;
            remaining = 0;
        }
    }
}

export function processFlashingGarbage(currentLevel = 1) {
    const now = performance.now();
    let garbageToAdd = 0;
    const segmentsToRemove = [];

    // Apply the same level-based speed multiplier used in the visual drawing
    const levelFactor = Math.min(20, currentLevel || 1);
    const speedMultiplier = 1 + (levelFactor - 1) * 0.15;
    const adjustedPHASE4 = PHASE4 / speedMultiplier;

    for (let i = 0; i < attackBarSegments.length; i++) {
        const segment = attackBarSegments[i];
        if (now - segment.timestamp >= adjustedPHASE4) {
            garbageToAdd += segment.value;
            segmentsToRemove.push(i);
        }
    }
    
    // Remove segments that have matured into garbage
    for (let i = segmentsToRemove.length - 1; i >= 0; i--) {
        attackBarSegments.splice(segmentsToRemove[i], 1);
    }
    
    return garbageToAdd;
}
