const Logger = require('./logger');

class Config {
    constructor() {
        this.loadEnvironment();
        this.validate();
        this.printConfig();
    }

    loadEnvironment() {
        // Discord
        this.DISCORD_TOKEN = process.env.DISCORD_TOKEN;
        this.OWNER_ID = process.env.OWNER_ID || '';
        this.PREFIX = process.env.PREFIX || '.';

        // Groq API Keys
        // Instant pool: key 1,2,3 | Thinking pool: key 4,5
        this.GROQ_API_KEYS = [
            process.env.GROQ_API_KEY_1,
            process.env.GROQ_API_KEY_2,
            process.env.GROQ_API_KEY_3,
            process.env.GROQ_API_KEY_4,
            process.env.GROQ_API_KEY_5
        ].filter(Boolean);

        // Models
        this.INSTANT_MODEL = process.env.INSTANT_MODEL || 'llama-3.1-8b-instant';
        this.THINKING_MODEL = process.env.THINKING_MODEL || 'openai/gpt-oss-120b';

        // Firebase
        this.FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
        this.FIREBASE_SERVICE_ACCOUNT = process.env.FIREBASE_SERVICE_ACCOUNT;

        // Limits
        this.INSTANT_DAILY_LIMIT = parseInt(process.env.INSTANT_DAILY_LIMIT) || 7;
        this.THINKING_DAILY_LIMIT = parseInt(process.env.THINKING_DAILY_LIMIT) || 3;
        this.INSTANT_COOLDOWN = parseInt(process.env.INSTANT_COOLDOWN) || 10;
        this.THINKING_COOLDOWN = parseInt(process.env.THINKING_COOLDOWN) || 30;
        this.INSTANT_MAX_CHARS = parseInt(process.env.INSTANT_MAX_CHARS) || 300;
        this.THINKING_MAX_CHARS = parseInt(process.env.THINKING_MAX_CHARS) || 200;

        // Session & History
        this.SESSION_DAYS = parseInt(process.env.SESSION_DAYS) || 7;
        this.HISTORY_DAYS = parseInt(process.env.HISTORY_DAYS) || 5;
        this.PRIVATE_CHAT_TIMEOUT = parseInt(process.env.PRIVATE_CHAT_TIMEOUT) || 3600000;
        this.INACTIVE_CHECK_DAYS = parseInt(process.env.INACTIVE_CHECK_DAYS) || 7;
        this.DELETE_AFTER_DAYS = parseInt(process.env.DELETE_AFTER_DAYS) || 1;
        this.RESET_HOUR_UTC = parseInt(process.env.RESET_HOUR_UTC) || 0;

        // Server
        this.PORT = process.env.PORT || 3000;
        this.NODE_ENV = process.env.NODE_ENV || 'production';

        // Bot Info
        this.BOT_NAME = 'Lol.AI';
        this.BOT_VERSION = '2.0.0';
    }

    validate() {
        const required = ['DISCORD_TOKEN', 'OWNER_ID', 'FIREBASE_PROJECT_ID', 'FIREBASE_SERVICE_ACCOUNT'];
        const missing = required.filter(key => !this[key]);

        if (missing.length > 0) {
            Logger.error(`❌ Thiếu biến môi trường: ${missing.join(', ')}`);
            if (this.NODE_ENV === 'production') process.exit(1);
        }

        if (this.GROQ_API_KEYS.length === 0) {
            Logger.error('❌ Cần ít nhất 1 GROQ_API_KEY');
            if (this.NODE_ENV === 'production') process.exit(1);
        }

        // Cảnh báo nếu không đủ key cho từng pool
        if (this.GROQ_API_KEYS.length < 3) {
            Logger.warn(`⚠️ Instant pool cần 3 keys (key 1,2,3), hiện có ${Math.min(this.GROQ_API_KEYS.length, 3)}`);
        }
        if (this.GROQ_API_KEYS.length < 4) {
            Logger.warn('⚠️ Thinking pool cần key 4,5 — sẽ fallback về Instant pool');
        }

        if (!/^\d{17,20}$/.test(this.OWNER_ID)) {
            Logger.warn(`⚠️ OWNER_ID không hợp lệ: ${this.OWNER_ID}`);
        }
    }

    printConfig() {
        const instantKeys = Math.min(this.GROQ_API_KEYS.length, 3);
        const thinkingKeys = Math.max(this.GROQ_API_KEYS.length - 3, 0);

        Logger.success(`${this.BOT_NAME} v${this.BOT_VERSION}`);
        Logger.info('='.repeat(50));
        Logger.info(`🎮 Env: ${this.NODE_ENV}`);
        Logger.info(`🤖 Prefix: "${this.PREFIX}"`);
        Logger.info(`⚡ Instant model: ${this.INSTANT_MODEL}`);
        Logger.info(`🧠 Thinking model: ${this.THINKING_MODEL}`);
        Logger.info(`👑 Owner: ${this.OWNER_ID}`);
        Logger.info(`🔑 Instant pool: ${instantKeys} keys | Thinking pool: ${thinkingKeys} keys`);
        Logger.info(`💾 Firebase: ${this.FIREBASE_PROJECT_ID}`);
        Logger.info(`⚡ Instant: ${this.INSTANT_DAILY_LIMIT}/ngày, CD ${this.INSTANT_COOLDOWN}s`);
        Logger.info(`🧠 Thinking: ${this.THINKING_DAILY_LIMIT}/ngày, CD ${this.THINKING_COOLDOWN}s`);
        Logger.info('='.repeat(50));
    }

    isOwner(userId) {
        return userId === this.OWNER_ID;
    }
}

module.exports = new Config();
