// ゲーム内で使用する各種設定パラメータ
const CONFIG = {
    board: {
      rows: 22,              // 全体の行数（上部は隠し行）
      visibleRows: 20,       // 表示される行数
      cols: 10,              // カラム数
      cellSize: 25           // セル1個あたりのピクセルサイズ（後でレイアウト変更しやすいように）
    },
    // 落下間隔（レベルに応じて後で調整可能）
    dropInterval: 1000,      // ミリ秒単位
    // 得点設定（1ライン、2ライン、3ライン、TETRIS、Tスピン時）
  scoring: {
    single: 100,
    double: 300,
    triple: 500,
    tetris: 800,
    tspin: 400,
    tspinSingle: 800,
    tspinDouble: 1200,
    tspinTriple: 1600,
    tspinMini: 100,
    perfectClearSingle: 800,
    perfectClearDouble: 1000,
    perfectClearTriple: 1800,
    perfectClearTetris: 2000,
    drop: 2  // 1マスドロップごとに2点
  },
    // パレット（tetrominoの色、ゴースト、エフェクト色）
    colors: {
      background: "#222",
      boardBackground: "#111",
      // インデックス： 1:I, 2:J, 3:L, 4:O, 5:S, 6:T, 7:Z
      tetromino: [
        null,
        "#00f0f0", // I
        "#0000f0", // J
        "#f0a000", // L
        "#f0f000", // O
        "#00f000", // S
        "#a000f0", // T
        "#f00000"  // Z
      ],
      ghost: "rgba(255,255,255,0.3)",
      lineClear: "rgba(0, 255, 255, 0.7)"
    },
      tetromino: {
    borderWidth: 2, // テトリミノの枠の太さ
  },
    // エフェクトの継続時間（ライン消去、Tスピンなど）
    effects: {
      lineClearDuration: 250,    // ライン消去時の光るエフェクト（ms）
      tspinEffectDuration: 1000  // Tスピン時のエフェクト表示時間（ms）
    },
      ui: {
    previewScale: 0.8, // HOLD, NEXT のミノの縮小率
    boxPadding: 5, // HOLD, NEXT の枠の余白
    fontSize: 18, // UIのフォントサイズ
    textColor: "#fff", // UIのテキストカラー
  },
    // キーバインディング（z:左回転、x:右回転、矢印:移動、スペース:ハードドロップ、c:ホールド）
    keyBindings: {
      rotateCCW: "KeyZ",
      rotateCW: "KeyX",
      moveLeft: "ArrowLeft",
      moveRight: "ArrowRight",
      softDrop: "ArrowDown",
      hardDrop: "Space",
      hold: "KeyC"
    },
    // デバッグ用。お邪魔ブロック（オンライン機能実装時用）を呼び出すかどうか
    debug: {
      enableGarbage: true
    },
    
  };
  