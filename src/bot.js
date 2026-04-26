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
                GatewayIntentBits.MessageContent, // Quan trọng: Phải bật cái này ở Discord Developer Portal
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
            if (!fs.existsSync(commandsPath)) return Logger.error("Thư mục 'commands' không tồn tại!");
            
            const files = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
            for (const file of files) {
                const cmd = require(path.join(commandsPath, file));
                if ('name' in cmd && 'execute' in cmd) {
                    this.commands.set(cmd.name.toLowerCase(), cmd);
                    Logger.success(`Loaded: ${cmd.name}`);
                } else {
                    Logger.warn(`Skip ${file}: thiếu name hoặc execute`);
                }
            }
            Logger.info(`Tổng cộng: ${this.commands.size} lệnh.`);
        } catch (error) {
            Logger.error('Lỗi load commands:', error.message);
        }
    }

    setupEventHandlers() {
        this.client.once(Events.ClientReady, async () => {
            Logger.success(`✅ ${Config.BOT_NAME} online! Prefix: ${Config.PREFIX}`);
            
            try {
                await this.client.user.setPresence({
                    activities: [{ name: `${Config.PREFIX}help`, type: 0 }],
                    status: 'online'
                });
            } catch (err) {}

            this.privateManager.startCleanup(this.client);
            this.startInactiveCheck();
            this.startSessionAlert();
            this.startQuotaReset();
        });

        this.client.on(Events.MessageCreate, async (message) => {
            try {
                if (message.author.bot) return;

                // 1. Xử lý Private Chat (nếu đang trong phiên chat riêng)
                const privateData = this.privateManager.getChat(message.author.id);
                if (privateData && message.channel.id === privateData.channelId) {
                    this.privateManager.updateActivity(message.author.id);
                    
                    if (message.content.startsWith(Config.PREFIX)) {
                        return await this.handleCommand(message);
                    } else {
                        return await this.handlePrivateMessage(message);
                    }
                }

                // 2. Xử lý lệnh Prefix (Bắt đầu bằng .)
                if (message.content.startsWith(Config.PREFIX)) {
                    return await this.handleCommand(message);
                }

                // 3. Xử lý DM (không cần prefix cũng được hoặc tùy bạn)
                if (message.channel.type === 1) { // DM
                    if (message.content.startsWith(Config.PREFIX)) {
                        await this.handleCommand(message);
                    }
                }

            } catch (error) {
                Logger.error('Lỗi MessageCreate:', error);
            }
        });

        this.client.on(Events.InteractionCreate, async (interaction) => {
            await this.handleInteraction(interaction);
        });
    }

    async handleCommand(message) {
        // Cắt prefix và chia args
        const args = message.content.slice(Config.PREFIX.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();

        // [DEBUG] Log để bạn xem bot có nhận được chữ sau dấu chấm không
        console.log(`[DEBUG] Lệnh nhận được: ${commandName} | Args: ${args.join(', ')}`);

        const command = this.commands.get(commandName);
        
        if (!command) {
            console.log(`[DEBUG] Không tìm thấy lệnh: ${commandName}`);
            return;
        }

        // Kiểm tra Cooldown
        if (!this.cooldowns.has(command.name)) {
            this.cooldowns.set(command.name, new Collection());
        }
        const timestamps = this.cooldowns.get(command.name);
        const cooldownAmount = (command.cooldown || Config.INSTANT_COOLDOWN || 3) * 1000;

        if (timestamps.has(message.author.id)) {
            const expirationTime = timestamps.get(message.author.id) + cooldownAmount;
            if (Date.now() < expirationTime) {
                const timeLeft = ((expirationTime - Date.now()) / 1000).toFixed(1);
                return message.reply(`⏰ Chậm lại chút! Chờ ${timeLeft}s nữa.`).then(m => setTimeout(() => m.delete().catch(() => {}), 3000));
            }
        }
        timestamps.set(message.author.id, Date.now());
        setTimeout(() => timestamps.delete(message.author.id), cooldownAmount);

        try {
            // Thực thi lệnh
            await command.execute(message, args, {
                bot: this,
                privateManager: this.privateManager
            });
        } catch (error) {
            Logger.error(`Lỗi thực thi lệnh ${commandName}:`, error);
            message.reply('❌ Có lỗi xảy ra khi thực hiện lệnh này!');
        }
    }

    // Giữ nguyên handleInteraction và các hàm phụ trợ bên dưới như bạn đã gửi ở prompt trước...
    async handleInteraction(interaction) {
        try {
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

            if (interaction.isButton()) {
                const customId = interaction.customId;
                if (customId.startsWith('appeal_open_')) {
                    const requestUserId = customId.replace('appeal_open_', '');
                    if (interaction.user.id !== requestUserId) return interaction.reply({ content: '❌ Không phải của bạn!', ephemeral: true });
                    const cmd = this.commands.get('appeal');
                    if (cmd?.handleOpenButton) await cmd.handleOpenButton(interaction);
                    return;
                }
                if (customId.startsWith('feedback_open_')) {
                    const requestUserId = customId.replace('feedback_open_', '');
                    if (interaction.user.id !== requestUserId) return interaction.reply({ content: '❌ Không phải của bạn!', ephemeral: true });
                    const cmd = this.commands.get('feedbacks');
                    if (cmd?.handleOpenButton) await cmd.handleOpenButton(interaction);
                    return;
                }
                if (customId.startsWith('approve_appeal_')) {
                    if (!Config.isOwner(interaction.user.id)) return interaction.reply({ content: '❌ Chỉ admin!', ephemeral: true });
                    const targetUserId = customId.replace('approve_appeal_', '');
                    const cmd = this.commands.get('appeal');
                    if (cmd?.handleApprove) await cmd.handleApprove(interaction, targetUserId);
                    return;
                }
                if (customId.startsWith('deny_appeal_')) {
                    if (!Config.isOwner(interaction.user.id)) return interaction.reply({ content: '❌ Chỉ admin!', ephemeral: true });
                    const targetUserId = customId.replace('deny_appeal_', '');
                    const cmd = this.commands.get('appeal');
                    if (cmd?.handleDeny) await cmd.handleDeny(interaction, targetUserId);
                    return;
                }
                return;
            }

            if (interaction.isChatInputCommand()) {
                const cmd = this.commands.get(interaction.commandName);
                if (cmd) await cmd.execute(interaction);
            }
        } catch (error) {
            Logger.error('Interaction error:', error);
        }
    }

    // Các hàm Background Tasks giữ nguyên...
    startInactiveCheck() { /* ... như cũ ... */ }
    startSessionAlert() { /* ... như cũ ... */ }
    startQuotaReset() { /* ... như cũ ... */ }
    async handlePrivateMessage(message) { /* ... như cũ ... */ }
    async start() {
        try {
            Logger.info('Connecting...');
            await this.client.login(Config.DISCORD_TOKEN);
            return this.client;
        } catch (e) { Logger.error(e.message); throw e; }
    }
    async stop() {
        this.privateManager.stopCleanup();
        await this.client.destroy();
    }
}

module.exports = DiscordBot;
