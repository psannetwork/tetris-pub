'use strict';

module.exports = {
    rating: {
        // 順位ごとのレート変動量 (例: 1位は+30, 最下位は-20など)
        // 参加人数に応じてスケールさせるロジックも組み込み可能
        calculateChange: (rank, totalPlayers) => {
            if (totalPlayers <= 1) return 0;
            
            // 簡易ロジック: 上位50%ならプラス、下位50%ならマイナス
            const mid = (totalPlayers + 1) / 2;
            const diff = mid - rank; 
            
            // 変動幅の重み
            const weight = 10;
            return Math.round(diff * weight);
        },
        initialRating: 1500
    },
    auth: {
        saltRounds: 10
    }
};
