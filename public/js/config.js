// ゲーム内で使用する各種設定パラメータ
export const CONFIG = {
    board: {
      rows: 22,              // 全体の行数（上部は隠し行）
      visibleRows: 20,       // 表示される行数
      cols: 10,              // カラム数
    },
    // 落下間隔（レベルに応じて後で調整可能）
    dropInterval: 1000,      // ミリ秒単位
    // 得点設定
    scoring: {
        single: 100, double: 300, triple: 500, tetris: 800,
        tspin: 400, tspinSingle: 800, tspinDouble: 1200, tspinTriple: 1600,
        tspinMini: 100, perfectClearSingle: 800, perfectClearDouble: 1000,
        perfectClearTriple: 1800, perfectClearTetris: 2000, drop: 2
    },
    // 色設定
    colors: {
        background: "#2c3e50",
        boardBackground: "#222",
        // インデックス： 1:I, 2:J, 3:L, 4:O, 5:S, 6:T, 7:Z
        tetromino: [
            null, "#3498db", "#2980b9", "#e67e22", "#f1c40f", "#2ecc71", "#9b59b6", "#e74c3c"
        ],
        ghost: "rgba(255,255,255,0.2)",
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
    // エフェクト設定
    effects: {
        lineClearDuration: 250,
        tspinEffectDuration: 1000
    },
    // UI設定
    ui: {
        fontFamily: "'Exo 2', sans-serif",
        fontSize: "1rem",
        fontSizeLarge: "1.5rem",
        fontSizeXLarge: "3rem",
        previewScale: 0.8,
        boxPadding: 10, 
        holdNextScale: 0.25,
    },
    // キーバインディング
    keyBindings: {
        rotateCCW: "KeyZ", rotateCW: "KeyX", moveLeft: "ArrowLeft", moveRight: "ArrowRight",
        softDrop: "ArrowDown", hardDrop: "Space", hold: "KeyC"
    },
    game: {
        nextPiecesCount: 5
    },
    debug: {
        enableGarbage: true
    },
    MAX_MINIBOARDS_PER_SIDE: 49,
    serverUrl: 'https://special-doodle-ggq6qrpxpgjhvp45-6000.app.github.dev',

    // テトリミノの形状定義
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

  