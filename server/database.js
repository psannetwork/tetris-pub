'use strict';

const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');
const config = require('./config');

const dbPath = path.join(__dirname, '../users.db');
const db = new sqlite3.Database(dbPath);

// テーブル初期化
db.serialize(() => {
    // settingsカラムを追加（JSON文字列として保存）
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password_hash TEXT,
            nickname TEXT,
            rating INTEGER DEFAULT 1500,
            settings TEXT,
            registration_ip TEXT -- 1人1アカウント制限用
        )
    `);
});

class Database {
    static async createUser(username, password, nickname, ip) {
        const hash = await bcrypt.hash(password, config.auth.saltRounds);
        return new Promise((resolve, reject) => {
            const nick = nickname || username;
            db.run(
                'INSERT INTO users (username, password_hash, nickname, rating, registration_ip) VALUES (?, ?, ?, ?, ?)',
                [username, hash, nick, config.rating.initialRating, ip],
                function(err) {
                    if (err) return reject(err);
                    resolve({ id: this.lastID, username, nickname: nick, rating: config.rating.initialRating });
                }
            );
        });
    }

    static async getAccountByIp(ip) {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM users WHERE registration_ip = ?', [ip], (err, row) => {
                if (err) return reject(err);
                resolve(row);
            });
        });
    }

    static async getUser(username) {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
                if (err) return reject(err);
                if (row && row.settings) {
                    try { row.settings = JSON.parse(row.settings); } catch(e) { row.settings = null; }
                }
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

    static async updateUserSettings(username, nickname, settings) {
        return new Promise((resolve, reject) => {
            const settingsJson = settings ? JSON.stringify(settings) : null;
            db.run(
                'UPDATE users SET nickname = ?, settings = ? WHERE username = ?',
                [nickname, settingsJson, username],
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