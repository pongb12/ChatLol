const Logger = require('./logger');
const Config = require('./config');

class PromptFirewall {
    constructor() {
        this.patterns = [
            /ignore (all )?previous/i,
            /ignore previous instructions/i,
            /system (prompt|message|instruction)s?/i,
            /hãy in (toàn bộ )?prompt/i,
            /show (me )?the prompt/i,
            /reveal the system/i,
            /give me the system prompt/i,
            /disclose internal/i,
            /expose the prompt/i,
            /bypass (the )?filter/i,
            /act as .*system/i,
            /what are your instructions/i,
            /what is your prompt/i,
            /dưới đây là các luật/i
        ];

        this.attempts = new Map(); // userId -> [timestamps]
        this.bannedUsers = new Map(); // userId -> expiresAt

        this.BAN_THRESHOLD = 5;
        this.BAN_DURATION = 3600000; // 1 hour
        this.WINDOW = 600000; // 10 minutes

        this.startCleanup();
        Logger.info('🛡️ Firewall initialized');
    }

    analyze(text) {
        if (!text || typeof text !== 'string') return { safe: true };
        const lower = text.toLowerCase();

        for (const p of this.patterns) {
            if (p.test(lower)) {
                return { safe: false, reason: 'prompt_injection' };
            }
        }
        return { safe: true };
    }

    async check(userId, text) {
        if (Config.isOwner(userId)) return { allowed: true, isOwner: true };
        if (this.isBanned(userId)) return { allowed: false, reason: 'banned' };

        const analysis = this.analyze(text);
        if (!analysis.safe) {
            const now = Date.now();
            const arr = this.attempts.get(userId) || [];
            const filtered = arr.filter(t => now - t < this.WINDOW);
            filtered.push(now);
            this.attempts.set(userId, filtered);

            Logger.warn(`🛡️ ${userId.slice(0,6)} triggered ${analysis.reason} (${filtered.length}/${this.BAN_THRESHOLD})`);

            if (filtered.length >= this.BAN_THRESHOLD) {
                this.ban(userId, `auto:${analysis.reason}`);
                return { allowed: false, reason: 'banned' };
            }
            return { allowed: false, reason: 'warning' };
        }

        return { allowed: true };
    }

    ban(userId, reason = 'manual') {
        const expires = Date.now() + this.BAN_DURATION;
        this.bannedUsers.set(userId, expires);
        Logger.error(`🚫 Banned ${userId.slice(0,6)} until ${new Date(expires).toLocaleString('vi-VN')} (${reason})`);
    }

    unban(userId) {
        if (this.bannedUsers.has(userId)) {
            this.bannedUsers.delete(userId);
            Logger.success(`🔓 Unbanned ${userId.slice(0,6)}`);
            return true;
        }
        return false;
    }

    isBanned(userId) {
        const expires = this.bannedUsers.get(userId);
        if (!expires) return false;
        if (Date.now() > expires) {
            this.bannedUsers.delete(userId);
            return false;
        }
        return true;
    }

    sanitize(text) {
        if (!text || typeof text !== 'string') return text;
        return text
            .replace(/system prompt|system message|system instruction|system rules/gi, '[REDACTED]')
            .replace(/internal configuration|backend config/gi, '[REDACTED]');
    }

    startCleanup() {
        setInterval(() => {
            const now = Date.now();
            for (const [uid, arr] of this.attempts.entries()) {
                const filtered = arr.filter(t => now - t < this.WINDOW);
                if (!filtered.length) this.attempts.delete(uid);
                else this.attempts.set(uid, filtered);
            }
            for (const [uid, exp] of this.bannedUsers.entries()) {
                if (now > exp) {
                    this.bannedUsers.delete(uid);
                    Logger.info(`🔓 Auto-unbanned ${uid.slice(0,6)}`);
                }
            }
        }, 60000);
    }
}

module.exports = new PromptFirewall();
