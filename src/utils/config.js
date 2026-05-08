const Logger = require('./logger');

class Config {
    constructor() {
        this.loadEnvironment();
        this.validate();
        this.printConfig();
    }

    loadEnvironment() {
        this.DISCORD_TOKEN = process.env.DISCORD_TOKEN;
        this.OWNER_ID      = process.env.OWNER_ID  || '';
        this.SERVER_ID     = process.env.SERVER_ID || ''; // Home server, auto-authorized
        this.PREFIX        = process.env.PREFIX    || '.';

        this.GROQ_API_KEYS = [
            process.env.GROQ_API_KEY_1, process.env.GROQ_API_KEY_2,
            process.env.GROQ_API_KEY_3, process.env.GROQ_API_KEY_4,
            process.env.GROQ_API_KEY_5
        ].filter(Boolean);

        this.INSTANT_MODEL  = process.env.INSTANT_MODEL  || 'llama-3.1-8b-instant';
        this.THINKING_MODEL = process.env.THINKING_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct';

        this.FIREBASE_PROJECT_ID      = process.env.FIREBASE_PROJECT_ID;
        this.FIREBASE_SERVICE_ACCOUNT = process.env.FIREBASE_SERVICE_ACCOUNT;

        this.INSTANT_DAILY_LIMIT  = parseInt(process.env.INSTANT_DAILY_LIMIT)  || 7;
        this.THINKING_DAILY_LIMIT = parseInt(process.env.THINKING_DAILY_LIMIT) || 3;
        this.INSTANT_COOLDOWN     = parseInt(process.env.INSTANT_COOLDOWN)     || 10;
        this.THINKING_COOLDOWN    = parseInt(process.env.THINKING_COOLDOWN)    || 30;
        this.INSTANT_MAX_CHARS    = parseInt(process.env.INSTANT_MAX_CHARS)    || 300;
        this.THINKING_MAX_CHARS   = parseInt(process.env.THINKING_MAX_CHARS)   || 200;

        this.SESSION_DAYS         = parseInt(process.env.SESSION_DAYS)         || 7;
        this.HISTORY_DAYS         = parseInt(process.env.HISTORY_DAYS)         || 5;
        this.PRIVATE_CHAT_TIMEOUT = parseInt(process.env.PRIVATE_CHAT_TIMEOUT) || 3600000;
        this.INACTIVE_CHECK_DAYS  = parseInt(process.env.INACTIVE_CHECK_DAYS)  || 7;
        this.DELETE_AFTER_DAYS    = parseInt(process.env.DELETE_AFTER_DAYS)    || 1;
        this.RESET_HOUR_UTC       = parseInt(process.env.RESET_HOUR_UTC)       || 0;

        this.PORT     = process.env.PORT     || 3000;
        this.NODE_ENV = process.env.NODE_ENV || 'production';

        this.BOT_NAME    = 'Lol.AI';
        this.BOT_VERSION = '2.0.0';
    }

    validate() {
        const required = ['DISCORD_TOKEN', 'OWNER_ID', 'FIREBASE_PROJECT_ID', 'FIREBASE_SERVICE_ACCOUNT'];
        const missing  = required.filter(k => !this[k]);
        if (missing.length) {
            Logger.error(`❌ Thiếu biến môi trường: ${missing.join(', ')}`);
            if (this.NODE_ENV === 'production') process.exit(1);
        }
        if (!this.GROQ_API_KEYS.length) {
            Logger.error('❌ Cần ít nhất 1 GROQ_API_KEY');
            if (this.NODE_ENV === 'production') process.exit(1);
        }
        if (!this.SERVER_ID) Logger.warn('⚠️ SERVER_ID chưa set — home server chưa được auto-authorize');
        if (!/^\d{17,20}$/.test(this.OWNER_ID)) Logger.warn(`⚠️ OWNER_ID không hợp lệ: ${this.OWNER_ID}`);
    }

    printConfig() {
        Logger.success(`${this.BOT_NAME} v${this.BOT_VERSION}`);
        Logger.info('='.repeat(50));
        Logger.info(`🎮 Env:            ${this.NODE_ENV}`);
        Logger.info(`🤖 Prefix:         "${this.PREFIX}"`);
        Logger.info(`⚡ Instant model:  ${this.INSTANT_MODEL}`);
        Logger.info(`🧠 Thinking model: ${this.THINKING_MODEL}`);
        Logger.info(`👑 Owner:          ${this.OWNER_ID}`);
        Logger.info(`🏠 Home server:    ${this.SERVER_ID || '(not set)'}`);
        Logger.info(`🔑 Instant pool: ${Math.min(this.GROQ_API_KEYS.length,3)} keys | Thinking pool: ${Math.max(this.GROQ_API_KEYS.length-3,0)} keys`);
        Logger.info(`💾 Firebase:       ${this.FIREBASE_PROJECT_ID}`);
        Logger.info('='.repeat(50));
    }

    isOwner(userId)        { return userId   === this.OWNER_ID; }
    isHomeServer(guildId)  { return guildId  === this.SERVER_ID; }
}

module.exports = new Config();
