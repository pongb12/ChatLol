const express = require('express');
const DiscordBot = require('./bot');
const Config = require('./utils/config');
const Logger = require('./utils/logger');

class Application {
    constructor() {
        this.app = express();
        this.port = Config.PORT;
        this.bot = null;
        this.server = null;

        this.setupExpress();
        this.setupProcessHandlers();
    }

    setupExpress() {
        this.app.use(express.json());

        this.app.get('/', (req, res) => {
            const uptime = process.uptime();
            const h = Math.floor(uptime / 3600);
            const m = Math.floor((uptime % 3600) / 60);
            const s = Math.floor(uptime % 60);

            res.json({
                status: 'online',
                service: Config.BOT_NAME,
                version: Config.BOT_VERSION,
                instant_model: Config.INSTANT_MODEL,
                thinking_model: Config.THINKING_MODEL,
                uptime: `${h}h ${m}m ${s}s`,
                timestamp: new Date().toISOString()
            });
        });

        this.app.get('/health', (req, res) => {
            res.status(200).json({
                status: 'healthy',
                discord: this.bot?.client?.readyAt ? 'connected' : 'disconnected',
                timestamp: Date.now()
            });
        });

        this.app.get('/ping', (req, res) => {
            res.json({ ping: 'pong', timestamp: Date.now() });
        });

        this.app.use('*', (req, res) => {
            res.status(404).json({ error: 'Not found' });
        });
    }

    setupProcessHandlers() {
        process.on('uncaughtException', (error) => {
            Logger.error('UNCAUGHT:', error);
        });

        process.on('unhandledRejection', (reason) => {
            Logger.error('UNHANDLED:', reason);
        });

        const shutdown = async (signal) => {
            Logger.warn(`Signal ${signal}, shutting down...`);
            try {
                if (this.bot) await this.bot.stop();
                if (this.server) {
                    this.server.close(() => {
                        Logger.success('HTTP server closed');
                        process.exit(0);
                    });
                    setTimeout(() => process.exit(1), 5000);
                } else {
                    process.exit(0);
                }
            } catch (error) {
                Logger.error('Shutdown error:', error);
                process.exit(1);
            }
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));
    }

    async start() {
        try {
            this.server = this.app.listen(this.port, () => {
                Logger.success(`🌐 Web server on port ${this.port}`);
            });

            Logger.info('🤖 Starting Discord bot...');
            this.bot = new DiscordBot();
            await this.bot.start();

            Logger.success('🎉 Application ready!');
            return { server: this.server, bot: this.bot };

        } catch (error) {
            Logger.error('Startup error:', error);
            if (this.server) this.server.close();
            process.exit(1);
        }
    }
}

if (require.main === module) {
    const app = new Application();
    app.start().catch(error => {
        Logger.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = Application;
