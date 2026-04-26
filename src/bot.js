const { Client, GatewayIntentBits, Collection, Events, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const Config = require('./utils/config');
const Logger = require('./utils/logger');
const Firebase = require('./utils/firebase');
const PrivateChatManager = require('./privateManager');

class DiscordBot {
    constructor() {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.GuildMembers,
                GatewayIntentBits.DirectMessages
            ],
            partials: ['CHANNEL', 'MESSAGE', 'USER']
        });

        this.commands = new Collection();
        this.cooldowns = new Collection();
        this.privateManager = new PrivateChatManager();

        this.client.botInstance = this;
        this.client.privateManager = this.privateManager;
        this.client.commands = this.commands;

        this.loadCommands();
        this.setupEventHandlers();
    }

    loadCommands() {
        const commandsPath = path.join(__dirname, 'commands');
        try {
            const files = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
            for (const file of files) {
                const cmd = require(path.join(commandsPath, file));
                if ('name' in cmd && 'execute' in cmd) {
                    this.commands.set(cmd.name, cmd);
                    Logger.success(`Loaded: ${cmd.name}`);
                } else {
                    Logger.warn(`Skip ${file}: missing name/execute`);
                }
            }
            Logger.info(`Total commands: ${this.commands.size}`);
        } catch (error) {
            Logger.error('Load commands error:', error.message);
        }
    }

    setupEventHandlers() {
        // Ready
        this.client.once(Events.ClientReady, async () => {
            Logger.success(`✅ ${Config.BOT_NAME} v${Config.BOT_VERSION} online!`);
            Logger.success(`Tag: ${this.client.user?.tag || 'Unknown'}`);
            Logger.success(`Servers: ${this.client.guilds.cache.size}`);

            try {
                await this.client.user.setPresence({
                    activities: [{ name: `${Config.PREFIX}help`, type: 0 }],
                    status: 'online'
                });
            } catch (err) {
                Logger.warn('Set presence failed:', err.message);
            }

            this.privateManager.startCleanup(this.client);
            this.startInactiveCheck();
            this.startSessionAlert();
            this.startQuotaReset();
        });

        // MessageCreate — đặt trực tiếp ở đây, KHÔNG dùng events folder
        this.client.on(Events.MessageCreate, async (message) => {
            try {
                if (message.author.bot) return;

                // Check private chat trước
                const privateData = this.privateManager.getChat(message.author.id);
                if (privateData && message.channel.id === privateData.channelId) {
                    this.privateManager.updateActivity(message.author.id);
                    // Commands vẫn hoạt động trong private chat (endprv, v.v)
                    if (message.content.startsWith(Config.PREFIX)) {
                        await this.handleCommand(message);
                    } else {
                        await this.handlePrivateMessage(message);
                    }
                    return;
                }

                // DM thường
                if (message.channel.type === 1 || message.channel.isDMBased()) {
                    if (!message.content.startsWith(Config.PREFIX)) return;
                    await this.handleCommand(message);
                    return;
                }

                // Guild
                if (!message.content.startsWith(Config.PREFIX)) return;
                await this.handleCommand(message);

            } catch (error) {
                Logger.error('MessageCreate error:', error);
            }
        });

        // Interaction
        this.client.on(Events.InteractionCreate, async (interaction) => {
            await this.handleInteraction(interaction);
        });

        // Errors
        this.client.on(Events.Error, (error) => {
            Logger.error('Discord client error:', error?.message);
        });

        this.client.on(Events.Warn, (warning) => {
            Logger.warn('Discord warning:', warning);
        });
    }

    /* ================= BACKGROUND TASKS ================= */
    startInactiveCheck() {
        setInterval(async () => {
            try {
                const inactive = await Firebase.getInactiveUsers(Config.INACTIVE_CHECK_DAYS);
                for (const user of inactive) {
                    try {
                        const discordUser = await this.client.users.fetch(user.id);
                        if (discordUser) {
                            const embed = new EmbedBuilder()
                                .setColor(0xFFA500)
                                .setTitle('⏰ Xác nhận hoạt động')
                                .setDescription(`Bạn đã offline ${Config.INACTIVE_CHECK_DAYS} ngày.\nGõ \`${Config.PREFIX}confirm\` trong **24 giờ** để giữ tài khoản.`)
                                .setTimestamp();

                            await discordUser.send({ embeds: [embed] }).catch(() => {});

                            setTimeout(async () => {
                                const current = await Firebase.getUser(user.id);
                                if (current) {
                                    const lastActive = current.lastActive?.toDate?.() || new Date(0);
                                    const daysInactive = (Date.now() - lastActive.getTime()) / 86400000;
                                    if (daysInactive >= Config.INACTIVE_CHECK_DAYS + 1) {
                                        await Firebase.deleteUser(user.id);
                                        Logger.warn(`Deleted inactive user: ${user.id}`);
                                    }
                                }
                            }, Config.DELETE_AFTER_DAYS * 86400000);
                        }
                    } catch (e) {
                        Logger.error('Inactive check error:', e);
                    }
                }
            } catch (e) {
                Logger.error('Inactive check failed:', e);
            }
        }, 86400000);
    }

    startSessionAlert() {
        setInterval(async () => {
            try {
                const users = await Firebase.db.collection('users')
                    .where('isLoggedIn', '==', true)
                    .where('isPermanentAdmin', '!=', true)
                    .get();

                const now = Date.now();
                const alertThreshold = now + 86400000;

                for (const doc of users.docs) {
                    const user = doc.data();
                    const expires = user.sessionExpires?.toDate?.();
                    if (!expires) continue;

                    if (expires.getTime() <= alertThreshold && expires.getTime() > now && !user.notifiedExpiry) {
                        try {
                            const discordUser = await this.client.users.fetch(doc.id);
                            if (discordUser) {
                                await discordUser.send(`⚠️ Session của bạn sẽ hết hạn sau 24h. Gõ \`${Config.PREFIX}login\` để gia hạn.`).catch(() => {});
                                await Firebase.updateUser(doc.id, { notifiedExpiry: true });
                            }
                        } catch (e) {}
                    }
                }
            } catch (e) {
                Logger.error('Session alert error:', e);
            }
        }, 3600000);
    }

    startQuotaReset() {
        const now = new Date();
        const nextReset = new Date(Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate(),
            Config.RESET_HOUR_UTC, 0, 0
        ));
        if (nextReset <= now) nextReset.setUTCDate(nextReset.getUTCDate() + 1);

        const msUntilReset = nextReset - now;
        setTimeout(() => {
            Firebase.resetAllQuotas();
            setInterval(() => Firebase.resetAllQuotas(), 86400000);
        }, msUntilReset);

        Logger.info(`⏰ Quota reset scheduled at ${nextReset.toISOString()}`);
    }

    /* ================= HANDLERS ================= */
    async handlePrivateMessage(message) {
        try {
            message.channel.sendTyping().catch(() => {});
            const ai = require('./ai');
            const response = await ai.process(message.author.id, message.content, 'instant', 'instant');
            await message.channel.send({ content: response }).catch(() => {});
        } catch (error) {
            Logger.error('Private message error:', error);
            await message.channel.send('❌ Lỗi. Thử lại!').catch(() => {});
        }
    }

    async handleCommand(message) {
        const args = message.content.slice(Config.PREFIX.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();

        const command = this.commands.get(commandName);
        if (!command) return;

        if (!this.cooldowns.has(command.name)) {
            this.cooldowns.set(command.name, new Collection());
        }

        const timestamps = this.cooldowns.get(command.name);
        const cooldownAmount = (command.cooldown || Config.INSTANT_COOLDOWN) * 1000;

        if (timestamps.has(message.author.id)) {
            const expirationTime = timestamps.get(message.author.id) + cooldownAmount;
            if (Date.now() < expirationTime) {
                const timeLeft = ((expirationTime - Date.now()) / 1000).toFixed(1);
                const reply = await message.reply(`⏰ Chờ ${timeLeft}s`);
                setTimeout(() => reply.delete().catch(() => {}), 3000);
                return;
            }
        }

        timestamps.set(message.author.id, Date.now());
        setTimeout(() => timestamps.delete(message.author.id), cooldownAmount);

        try {
            await command.execute(message, args, {
                bot: this,
                privateManager: this.privateManager
            });
        } catch (error) {
            Logger.error(`Command ${command.name} error:`, error);
            await message.reply('❌ Có lỗi. Thử lại!').catch(() => {});
        }
    }

    async handleInteraction(interaction) {
        try {
            // ===== MODAL SUBMIT =====
            if (interaction.isModalSubmit()) {
                const customId = interaction.customId;

                if (customId.startsWith('appeal_modal_')) {
                    const cmd = this.commands.get('appeal');
                    if (cmd?.handleModalSubmit) await cmd.handleModalSubmit(interaction);
                    return;
                }

                if (customId.startsWith('feedback_modal_')) {
                    const cmd = this.commands.get('feedbacks');
                    if (cmd?.handleModalSubmit) await cmd.handleModalSubmit(interaction);
                    return;
                }
                return;
            }

            // ===== BUTTON =====
            if (interaction.isButton()) {
                const customId = interaction.customId;

                // Mở form kháng cáo
                if (customId.startsWith('appeal_open_')) {
                    const requestUserId = customId.replace('appeal_open_', '');
                    // Chỉ cho phép đúng người nhấn
                    if (interaction.user.id !== requestUserId) {
                        return interaction.reply({ content: '❌ Đây không phải form của bạn!', ephemeral: true });
                    }
                    const cmd = this.commands.get('appeal');
                    if (cmd?.handleOpenButton) await cmd.handleOpenButton(interaction);
                    return;
                }

                // Mở form phản hồi
                if (customId.startsWith('feedback_open_')) {
                    const requestUserId = customId.replace('feedback_open_', '');
                    if (interaction.user.id !== requestUserId) {
                        return interaction.reply({ content: '❌ Đây không phải form của bạn!', ephemeral: true });
                    }
                    const cmd = this.commands.get('feedbacks');
                    if (cmd?.handleOpenButton) await cmd.handleOpenButton(interaction);
                    return;
                }

                // Admin chấp nhận kháng cáo
                if (customId.startsWith('approve_appeal_')) {
                    if (!Config.isOwner(interaction.user.id)) {
                        return interaction.reply({ content: '❌ Chỉ admin!', ephemeral: true });
                    }
                    const targetUserId = customId.replace('approve_appeal_', '');
                    const cmd = this.commands.get('appeal');
                    if (cmd?.handleApprove) await cmd.handleApprove(interaction, targetUserId);
                    return;
                }

                // Admin từ chối kháng cáo
                if (customId.startsWith('deny_appeal_')) {
                    if (!Config.isOwner(interaction.user.id)) {
                        return interaction.reply({ content: '❌ Chỉ admin!', ephemeral: true });
                    }
                    const targetUserId = customId.replace('deny_appeal_', '');
                    const cmd = this.commands.get('appeal');
                    if (cmd?.handleDeny) await cmd.handleDeny(interaction, targetUserId);
                    return;
                }

                return;
            }

            // ===== SLASH COMMAND =====
            if (interaction.isChatInputCommand()) {
                const cmd = this.commands.get(interaction.commandName);
                if (cmd) await cmd.execute(interaction);
            }

        } catch (error) {
            Logger.error('Interaction error:', error);
            // Tránh crash nếu interaction đã expired
            if (interaction.isRepliable && !interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ Có lỗi xảy ra.', ephemeral: true }).catch(() => {});
            }
        }
    }

    async start() {
        try {
            Logger.info('Connecting to Discord...');
            await this.client.login(Config.DISCORD_TOKEN);
            Logger.success('Bot logged in');
            return this.client;
        } catch (error) {
            Logger.error('Login error:', error.message);
            throw error;
        }
    }

    async stop() {
        Logger.info('Stopping bot...');
        this.privateManager.stopCleanup();
        try { await this.client.destroy(); } catch (e) {}
        Logger.success('Bot stopped');
    }
}

module.exports = DiscordBot;
