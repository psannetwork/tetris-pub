export let CELL_SIZE;
export let BOARD_WIDTH;
export let BOARD_HEIGHT;
export let ATTACK_BAR_WIDTH;
export let HOLD_BOX_WIDTH;
export let HOLD_BOX_HEIGHT;
export let NEXT_BOX_WIDTH;
export let NEXT_BOX_HEIGHT;
export let SCORE_AREA_HEIGHT;
export let MAIN_BOARD_CELL_SIZE;
export let ATTACK_BAR_GAP;
export let HOLD_BOX_GAP;
export let NEXT_BOX_GAP;
export let TOTAL_WIDTH;

export function setLayoutConstants(values) {
    CELL_SIZE = values.CELL_SIZE;
    BOARD_WIDTH = values.BOARD_WIDTH;
    BOARD_HEIGHT = values.BOARD_HEIGHT;
    ATTACK_BAR_WIDTH = values.ATTACK_BAR_WIDTH;
    HOLD_BOX_WIDTH = values.HOLD_BOX_WIDTH;
    HOLD_BOX_HEIGHT = values.HOLD_BOX_HEIGHT;
    NEXT_BOX_WIDTH = values.NEXT_BOX_WIDTH;
    NEXT_BOX_HEIGHT = values.NEXT_BOX_HEIGHT;
    SCORE_AREA_HEIGHT = values.SCORE_AREA_HEIGHT;

    // New constants
    MAIN_BOARD_CELL_SIZE = CELL_SIZE;
    ATTACK_BAR_GAP = 10; // Example value
    HOLD_BOX_GAP = 10;   // Example value
    NEXT_BOX_GAP = 10;   // Example value
    TOTAL_WIDTH = HOLD_BOX_WIDTH + HOLD_BOX_GAP + BOARD_WIDTH + ATTACK_BAR_WIDTH + ATTACK_BAR_GAP + NEXT_BOX_WIDTH;
}