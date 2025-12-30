'use strict';

const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');
const config = require('./config');

const dbPath = path.join(__dirname, '../users.db');
const db = new sqlite3.Database(dbPath);

// テーブル初期化
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password_hash TEXT,
            nickname TEXT,
            rating INTEGER DEFAULT 1500
        )
    `);
});

class Database {
    static async createUser(username, password, nickname) {
        const hash = await bcrypt.hash(password, config.auth.saltRounds);
        return new Promise((resolve, reject) => {
            const nick = nickname || username;
            db.run(
                'INSERT INTO users (username, password_hash, nickname, rating) VALUES (?, ?, ?, ?)',
                [username, hash, nick, config.rating.initialRating],
                function(err) {
                    if (err) return reject(err);
                    resolve({ id: this.lastID, username, nickname: nick, rating: config.rating.initialRating });
                }
            );
        });
    }

    static async getUser(username) {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
                if (err) return reject(err);
                resolve(row);
            });
        });
    }

    static async verifyUser(username, password) {
        const user = await this.getUser(username);
        if (!user) return null;
        const match = await bcrypt.compare(password, user.password_hash);
        return match ? user : null;
    }

    static async updateUserSettings(username, nickname) {
        return new Promise((resolve, reject) => {
            db.run(
                'UPDATE users SET nickname = ? WHERE username = ?',
                [nickname, username],
                (err) => {
                    if (err) return reject(err);
                    resolve();
                }
            );
        });
    }

    static async updateRating(username, change) {
        return new Promise((resolve, reject) => {
            db.run(
                'UPDATE users SET rating = rating + ? WHERE username = ?',
                [change, username],
                (err) => {
                    if (err) return reject(err);
                    resolve();
                }
            );
        });
    }
}

module.exports = Database;
