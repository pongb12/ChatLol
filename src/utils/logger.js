class Logger {
    static colors = {
        reset: '[0m',
        info: '[36m',
        success: '[32m',
        warn: '[33m',
        error: '[31m',
        api: '[35m'
    };

    static getTimestamp() {
        return new Date().toLocaleTimeString('vi-VN', { hour12: false });
    }

    static log(level, message, ...args) {
        const color = this.colors[level] || this.colors.reset;
        console.log(`${color}[${this.getTimestamp()}] ${message}${this.colors.reset}`, ...args);
    }

    static info(message, ...args) { this.log('info', `ℹ️  ${message}`, ...args); }
    static success(message, ...args) { this.log('success', `✅ ${message}`, ...args); }
    static warn(message, ...args) { this.log('warn', `⚠️  ${message}`, ...args); }
    static error(message, ...args) { this.log('error', `❌ ${message}`, ...args); }
    static api(message, ...args) { this.log('api', `🤖 ${message}`, ...args); }
}

module.exports = Logger;
