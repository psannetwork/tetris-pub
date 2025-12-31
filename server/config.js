'use strict';

module.exports = {
    server: {
        port: process.env.PORT || 6000,
        enableBots: true,
        botCount: 50,
        // trueの場合、全ボットが終了してから一斉にリトライを開始する
        botStartWith: false 
    },
    rating: {
        calculateChange: (rank, totalPlayers) => {
            if (totalPlayers <= 1) return 0;
            const mid = (totalPlayers + 1) / 2;
            const diff = mid - rank; 
            const weight = 10;
            return Math.round(diff * weight);
        },
        initialRating: 1500
    },
    auth: {
        saltRounds: 10
    }
};