'use strict';
export const CONFIG = {
    board: {
      rows: 22,
      visibleRows: 20,
      cols: 10,
    },
    dropInterval: 1000,
    scoring: {
        single: 100, double: 300, triple: 500, quad: 800,
        tspin: 400, tspinSingle: 800, tspinDouble: 1200, tspinTriple: 1600,
        tspinMini: 100, perfectClear: 1000, perfectClearSingle: 800, perfectClearDouble: 1000,
        perfectClearTriple: 1800, perfectClearQuad: 2000, drop: 2
    },
    colors: {
        background: "#2c3e50",
        boardBackground: "#222",
        tetromino: [
            null, "#d63031", "#00b894", "#fdcb6e", "#6c5ce7", "#0984e3", "#e17055", "#b2bec3"
        ],
        ghost: "rgba(255,255,255,0.2)",
        garbage: "#888",
        lineClear: "#3498db",
        attackBar: "#c0392b",
        text: "#ecf0f1",
        uiPanel: "rgba(0, 0, 0, 0.2)",
        uiBorder: "#ecf0f1",
        overlay: "rgba(0, 0, 0, 0.75)",
        win: "#2ecc71",
        lose: "#e74c3c",
        button: {
            primary: "#3498db",
            primaryHover: "#2980b9",
            primaryText: "#fff",
            focusGlow: "rgba(52, 152, 219, 0.5)"
        }
    },
    tetromino: {
        borderWidth: 2,
    },
    effects: {
        lineClearDuration: 250,
        tspinEffectDuration: 1000,
        particleGravity: 0.15,
        particleFriction: 0.98,
        orbAcceleration: 0.008,
        orbBaseSize: 15,
        orbRandomSize: 10,
        orbMaxTrailLength: 15,
        orbFadeDuration: 1000,
        textEffectFontSizeBase: 30,
        textEffectFontSizeShrink: 0.5,
        textEffectMoveUp: 50,
        tspinEffectFontSizeBase: 40,
        tspinEffectFontSizeShrink: 0.5,
        tspinEffectMoveUp: 30,
        particleCountQuad: 40,
        particleCountTspin: 30,
        particleCountB2B: 20,
        particleCountCombo: 15,
        particleCountDefaultMultiplier: 5,
        particleDurationBase: 400,
        particleDurationRandom: 300,
        lockPieceParticleCount: 5,
        lockPieceParticleVelocityFactor: 4,
        scoreUpdateDuration: 200,
        scoreUpdateScaleFactor: 0.2,
        targetAttackFlashDuration: 200,
        targetAttackFlashOpacity: 0.5,
        attackBarFlashSpeed: 100,
        attackBarFlashTime1: 12000,
        attackBarFlashTime2: 8000,
        attackBarFlashTime3: 4000,
        screenShakeIntensityFactor: 0.5,
        screenShakeEaseOutFactor: 2,
        ghostPieceOpacity: 0.3,
        lineClearEffectOpacity: 0.8,
        particleGravity: 0.1,
        drawBlockBorderRatio: 0.1,
        drawBlockFillRatio: 0.8,
        lightenDarkenAmount: 30,
        scoreUpdateEffectDuration: 200,
        scoreUpdateScaleFactor: 0.2,
        enableParticleEffects: true,
        enableOrbEffects: true,
        enableTextEffects: true,
        enableAppearanceEffects: true,
        enableComboEffects: true,
        enablePerfectClearEffects: true,
        enableAttackEffects: true,
        enableTimeoutEffects: true,
        enableMiniboardEntryEffects: true,
        maxParticlesPerClear: 100,
        maxOrbs: 20,
        appearanceParticleCount: 6,
        appearanceDuration: 500,
        appearanceFlashDuration: 300,
        comboTextDuration: 1000,
        perfectClearParticleCount: 100,
        perfectClearDuration: 1500,
        perfectClearTextDuration: 2000,
        perfectClearFlashDuration: 800,
        attackFlashDuration: 250,
    },
    ui: {
        fontFamily: "'Exo 2', sans-serif",
        fontSize: "1rem",
        fontSizeLarge: "1.5rem",
        fontSizeXLarge: "3rem",
        previewScale: 0.8,
        boxPadding: 10, 
        holdNextScale: 0.25,
        titledBoxFillOpacity: 0.2,
        titledBoxFontScale: 0.6,
        titledBoxTitleOffset: 0.7,
        miniPieceCellCount: 5,
        scoreFontSize: "0.9rem",
    },
    layout: {
        cellSize: 30,
        boardWidth: 300,
        boardHeight: 600,
        attackBarWidth: 30,
        holdBoxWidth: 96,
        holdBoxHeight: 96,
        nextBoxWidth: 90,
        nextBoxHeight: 324,
        scoreAreaHeight: 100,
    },
    keyBindings: {
        rotateCCW: "KeyZ", rotateCW: "KeyX", moveLeft: "ArrowLeft", moveRight: "ArrowRight",
        softDrop: "ArrowDown", hardDrop: "Space", hold: "KeyC"
    },
    game: {
        nextPiecesCount: 6,
        baseDropInterval: 1000
    },
    debug: {
        enableGarbage: true
    },
    MAX_MINIBOARDS_PER_SIDE: 40,
    serverUrl: 'https://tetris.psannetwork.net',
    TETROMINOES: {
        I: { shape: [[[-1, 0], [0, 0], [1, 0], [2, 0]], [[1, -1], [1, 0], [1, 1], [1, 2]], [[-1, 1], [0, 1], [1, 1], [2, 1]], [[0, -1], [0, 0], [0, 1], [0, 2]]] },
        J: { shape: [[[-1, -1], [-1, 0], [0, 0], [1, 0]], [[0, -1], [0, 0], [0, 1], [1, -1]], [[-1, 0], [0, 0], [1, 0], [1, 1]], [[-1, 1], [0, -1], [0, 0], [0, 1]]] },
        L: { shape: [[ [1, -1], [-1, 0], [0, 0], [1, 0]], [[0, -1], [0, 0], [0, 1], [1, 1]], [[-1, 0], [0, 0], [1, 0], [-1, 1]], [[-1, -1], [0, -1], [0, 0], [0, 1]]] },
        O: { shape: [[[0, 0], [1, 0], [0, 1], [1, 1]], [[0, 0], [1, 0], [0, 1], [1, 1]], [[0, 0], [1, 0], [0, 1], [1, 1]], [[0, 0], [1, 0], [0, 1], [1, 1]]] },
        S: { shape: [[[0, -1], [1, -1], [-1, 0], [0, 0]], [[0, -1], [0, 0], [1, 0], [1, 1]], [[0, 0], [1, 0], [-1, 1], [0, 1]], [[-1, -1], [-1, 0], [0, 0], [0, 1]]] },
        T: { shape: [[[0, -1], [-1, 0], [0, 0], [1, 0]], [[0, -1], [0, 0], [1, 0], [0, 1]], [[-1, 0], [0, 0], [1, 0], [0, 1]], [[0, -1], [-1, 0], [0, 0], [0, 1]]] },
        Z: { shape: [[[-1, -1], [0, -1], [0, 0], [1, 0]], [[1, -1], [0, 0], [1, 0], [0, 1]], [[-1, 0], [0, 0], [0, 1], [1, 1]], [[0, -1], [-1, 0], [0, 0], [-1, 1]]] }
    }
};

export function applyCustomSettings(settings) {
    if (!settings) return;
    
    // キーバインドの上書き
    if (settings.keyBindings) {
        Object.assign(CONFIG.keyBindings, settings.keyBindings);
    }
    
    // カラーの上書き
    if (settings.colors) {
        // インデックス 1:I, 2:J, 3:L, 4:O, 5:S, 6:T, 7:Z
        const keys = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
        keys.forEach((key, index) => {
            if (settings.colors[key]) {
                CONFIG.colors.tetromino[index + 1] = settings.colors[key];
            }
        });
    }
}