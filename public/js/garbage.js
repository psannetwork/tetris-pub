import { CONFIG } from './config.js';

export let attackBarSegments = [];
export const MAX_ATTACK = 20;
export const PHASE1 = 2000;
export const PHASE2 = 5000;
export const PHASE3 = 8000;

export function getAttackBarSum() {
  return attackBarSegments.reduce((sum, segment) => sum + segment.value, 0);
}

export function addAttackBar(value) {
    attackBarSegments.push({
        value: value,
        timestamp: Date.now()
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

export function processFlashingGarbage() {
    const now = Date.now();
    let garbageToAdd = 0;
    const remainingSegments = [];

    for (const segment of attackBarSegments) {
        if (now - segment.timestamp >= PHASE3) {
            garbageToAdd += segment.value;
        } else {
            remainingSegments.push(segment);
        }
    }
    attackBarSegments = remainingSegments;
    return garbageToAdd;
}
