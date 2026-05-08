const { Client, GatewayIntentBits, Collection, Events, EmbedBuilder } = require('discord.js');
const fs   = require('fs');
const path = require('path');
const Config         = require('./utils/config');
const Logger         = require('./utils/logger');
const Firebase       = require('./utils/firebase');
const PrivateChatManager = require('./privateManager');
const { formatVN, getNextResetTime } = require('./utils/time');

// Lệnh được phép dùng kể cả khi server chưa được xác thực
const BYPASS_COMMANDS = new Set(['help', 'intro']);
const AUTH_MSG = 'VIE: Server chưa được xác thực | ENG: The server is not authenticated.\nThe authentication feature will be updated in future versions.';

class DiscordBot {
    constructor() {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers,
                GatewayIntentBits.DirectMessages
            ],
            partials: ['CHANNEL', 'MESSAGE', 'USER']
        });

        this.commands       = new Collection();
        this.cooldowns      = new Collection();
        this.privateManager = new PrivateChatManager();

        // Auth cache: guildId → { authorized: bool, cachedAt: number }
        this.authCache    = new Map();
        this.AUTH_CACHE_TTL = 5 * 60 * 1000; // 5 phút

        this.client.botInstance    = this;
        this.client.privateManager = this.privateManager;
        this.client.commands       = this.commands;

        this.loadCommands();
        this.setupEventHandlers();
    }

    /* ─────────── COMMANDS ─────────── */
    loadCommands() {
        const dir = path.join(__dirname, 'commands');
        if (!fs.existsSync(dir)) return Logger.error("Thư mục 'commands' không tồn tại!");
        for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
            const cmd = require(path.join(dir, file));
            if (cmd.name && cmd.execute) { this.commands.set(cmd.name.toLowerCase(), cmd); Logger.success(`Loaded: ${cmd.name}`); }
            else Logger.warn(`Skip ${file}: thiếu name/execute`);
        }
        Logger.info(`Tổng: ${this.commands.size} lệnh`);
    }

    /* ─────────── AUTH CACHE ─────────── */
    async isGuildAuthorized(guildId) {
        const cached = this.authCache.get(guildId);
        if (cached && Date.now() - cached.cachedAt < this.AUTH_CACHE_TTL) return cached.authorized;
        const authorized = await Firebase.isServerAuthorized(guildId);
        this.authCache.set(guildId, { authorized, cachedAt: Date.now() });
        return authorized;
    }

    clearAuthCache(guildId) { this.authCache.delete(guildId); }

    /* ─────────── EVENT HANDLERS ─────────── */
    setupEventHandlers() {
        this.client.once(Events.ClientReady, async () => {
            Logger.success(`✅ ${Config.BOT_NAME} v${Config.BOT_VERSION} online!`);
            Logger.success(`Tag: ${this.client.user?.tag} | Servers: ${this.client.guilds.cache.size}`);
            try { await this.client.user.setPresence({ activities: [{ name: `${Config.PREFIX}help`, type: 0 }], status: 'online' }); } catch {}
            this.privateManager.startCleanup(this.client);
            this.startInactiveCheck();
            this.startSessionAlert();
            this.startQuotaReset();
        });

        // Bot join server mới → thông báo owner
        this.client.on(Events.GuildCreate, async (guild) => {
            Logger.info(`📥 Joined guild: ${guild.name} (${guild.id})`);
            try {
                const owner = await this.client.users.fetch(Config.OWNER_ID);
                if (owner) {
                    const embed = new EmbedBuilder().setColor(0x00FF00).setTitle('📥 Bot vừa vào server mới')
                        .addFields(
                            { name: '🏠 Tên server', value: guild.name, inline: true },
                            { name: '🆔 Server ID',  value: guild.id,   inline: true },
                            { name: '👥 Thành viên', value: guild.memberCount.toString(), inline: true },
                            { name: '📋 Chủ server', value: `${guild.ownerId}`, inline: true }
                        )
                        .setDescription(`Dùng \`${Config.PREFIX}acpt ${guild.id}\` để cấp phép server này.`)
                        .setTimestamp();
                    await owner.send({ embeds: [embed] }).catch(() => {});
                }
            } catch (e) { Logger.error('GuildCreate notify error:', e.message); }
        });

        // Bot bị kick → DM owner hoặc tự xóa data
        this.client.on(Events.GuildDelete, async (guild) => {
            Logger.warn(`📤 Left guild: ${guild.name || guild.id} (${guild.id})`);
            this.clearAuthCache(guild.id);

            const embed = new EmbedBuilder().setColor(0xFF0000).setTitle('📤 Bot bị kick / rời server')
                .addFields(
                    { name: '🏠 Tên server', value: guild.name || 'N/A', inline: true },
                    { name: '🆔 Server ID',  value: guild.id,            inline: true }
                )
                .setDescription(`Collection Firebase: \`servers/${guild.id}\`\nBạn có thể xóa thủ công hoặc bot sẽ tự xóa nếu DM này không gửi được.`)
                .setTimestamp();

            let dmSent = false;
            try {
                const owner = await this.client.users.fetch(Config.OWNER_ID);
                if (owner) {
                    await owner.send({ embeds: [embed] });
                    dmSent = true;
                    Logger.info(`📩 Notified owner about kicked guild: ${guild.id}`);
                }
            } catch (e) { Logger.warn('GuildDelete DM failed:', e.message); }

            // Nếu DM fail → tự xóa data
            if (!dmSent) {
                Logger.warn(`🗑️ DM failed, auto-deleting server data: ${guild.id}`);
                await Firebase.deleteServerData(guild.id).catch(e => Logger.error('deleteServerData:', e.message));
            }
        });

        this.client.on(Events.MessageCreate, async (message) => {
            try {
                if (message.author.bot) return;

                // Private chat
                const privateData = this.privateManager.getChat(message.author.id);
                if (privateData && message.channel.id === privateData.channelId) {
                    this.privateManager.updateActivity(message.author.id);
                    if (message.content.startsWith(Config.PREFIX)) await this.handleCommand(message);
                    else await this.handlePrivateMessage(message);
                    return;
                }

                // DM thuần
                if (message.channel.type === 1 || message.channel.isDMBased()) {
                    if (!message.content.startsWith(Config.PREFIX)) return;
                    await this.handleCommand(message);
                    return;
                }

                // Guild
                if (!message.content.startsWith(Config.PREFIX)) return;
                await this.handleCommand(message);
            } catch (e) { Logger.error('MessageCreate error:', e); }
        });

        this.client.on(Events.InteractionCreate, async (i) => { await this.handleInteraction(i); });
        this.client.on(Events.Error,  (e) => Logger.error('Discord error:', e?.message));
        this.client.on(Events.Warn,   (w) => Logger.warn('Discord warn:',   w));
    }

    /* ─────────── BACKGROUND TASKS ─────────── */
    startInactiveCheck() {
        setInterval(async () => {
            try {
                const inactive = await Firebase.getInactiveUsers(Config.INACTIVE_CHECK_DAYS);
                for (const user of inactive) {
                    try {
                        const du = await this.client.users.fetch(user.id);
                        if (du) {
                            await du.send({ embeds: [new EmbedBuilder().setColor(0xFFA500).setTitle('⏰ Xác nhận hoạt động')
                                .setDescription(`Bạn đã offline ${Config.INACTIVE_CHECK_DAYS} ngày.\nGõ \`${Config.PREFIX}confirm\` trong **24 giờ** để giữ tài khoản.`).setTimestamp()] }).catch(() => {});
                            setTimeout(async () => {
                                const cur = await Firebase.getUser(user.id);
                                if (cur) {
                                    const days = (Date.now() - (cur.lastActive?.toDate?.() || new Date(0)).getTime()) / 86400000;
                                    if (days >= Config.INACTIVE_CHECK_DAYS + 1) { await Firebase.deleteUser(user.id); Logger.warn(`Deleted inactive: ${user.id}`); }
                                }
                            }, Config.DELETE_AFTER_DAYS * 86400000);
                        }
                    } catch {}
                }
            } catch (e) { Logger.error('Inactive check:', e); }
        }, 86400000);
    }

    startSessionAlert() {
        setInterval(async () => {
            try {
                const users = await Firebase.db.collection('users_global')
                    .where('isLoggedIn', '==', true).where('isPermanentAdmin', '!=', true).get();
                const now = Date.now(), threshold = now + 86400000;
                for (const doc of users.docs) {
                    const u = doc.data(), exp = u.sessionExpires?.toDate?.();
                    if (!exp) continue;
                    if (exp.getTime() <= threshold && exp.getTime() > now && !u.notifiedExpiry) {
                        try {
                            const du = await this.client.users.fetch(doc.id);
                            if (du) { await du.send(`⚠️ Session hết hạn lúc **${formatVN(exp)}**. Gõ \`${Config.PREFIX}login\` để gia hạn.`).catch(() => {}); }
                            await Firebase.updateUser(doc.id, { notifiedExpiry: true });
                        } catch {}
                    }
                }
            } catch (e) { Logger.error('Session alert:', e); }
        }, 3600000);
    }

    startQuotaReset() {
        const next = getNextResetTime(Config.RESET_HOUR_UTC);
        setTimeout(() => { Firebase.resetAllQuotas(); setInterval(() => Firebase.resetAllQuotas(), 86400000); }, next.getTime() - Date.now());
        Logger.info(`⏰ Quota reset lúc ${formatVN(next)} (giờ VN)`);
    }

    /* ─────────── COMMAND HANDLER ─────────── */
    async handleCommand(message) {
        const args        = message.content.slice(Config.PREFIX.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();
        const command     = this.commands.get(commandName);
        if (!command) return;

        const guildId = message.guild?.id || null;

        // ── Guild auth check ──
        if (guildId && !BYPASS_COMMANDS.has(commandName)) {
            const authorized = await this.isGuildAuthorized(guildId);
            if (!authorized) {
                await message.reply(AUTH_MSG).catch(() => {});
                return;
            }
        }

        // ── Cooldown ──
        if (!this.cooldowns.has(command.name)) this.cooldowns.set(command.name, new Collection());
        const timestamps    = this.cooldowns.get(command.name);
        const cooldownAmount = (command.cooldown || Config.INSTANT_COOLDOWN || 3) * 1000;
        if (timestamps.has(message.author.id)) {
            const exp = timestamps.get(message.author.id) + cooldownAmount;
            if (Date.now() < exp) {
                const reply = await message.reply(`⏰ Chờ ${((exp - Date.now()) / 1000).toFixed(1)}s`);
                setTimeout(() => reply.delete().catch(() => {}), 3000);
                return;
            }
        }
        timestamps.set(message.author.id, Date.now());
        setTimeout(() => timestamps.delete(message.author.id), cooldownAmount);

        try {
            await command.execute(message, args, {
                bot: this,
                privateManager: this.privateManager,
                serverId: guildId  // null nếu DM
            });
        } catch (e) {
            Logger.error(`Command ${commandName} error:`, e);
            await message.reply('❌ Có lỗi. Thử lại!').catch(() => {});
        }
    }

    async handlePrivateMessage(message) {
        try {
            const user = await Firebase.getUser(message.author.id);
            if (!user) return message.channel.send(`❌ Chưa đăng ký! Gõ \`${Config.PREFIX}signup\`.`).catch(() => {});
            if (!user.isLoggedIn && !Config.isOwner(message.author.id)) return message.channel.send(`🔒 Chưa đăng nhập! Gõ \`${Config.PREFIX}login\`.`).catch(() => {});
            message.channel.sendTyping().catch(() => {});
            const ai       = require('./ai');
            const model    = user.preferredModel || 'instant';
            const response = await ai.process(message.author.id, message.content, model, 'private', null);
            await message.channel.send({ content: response }).catch(() => {});
        } catch (e) { Logger.error('Private message error:', e); await message.channel.send('❌ Lỗi. Thử lại!').catch(() => {}); }
    }

    async handleInteraction(interaction) {
        try {
            if (interaction.isModalSubmit()) {
                const id = interaction.customId;
                if (id.startsWith('appeal_modal_') || id.startsWith('appeal_deny_reason_')) { const c = this.commands.get('appeal');    if (c?.handleModalSubmit) await c.handleModalSubmit(interaction); return; }
                if (id.startsWith('feedback_modal_') || id.startsWith('feedback_reply_'))   { const c = this.commands.get('feedbacks'); if (c?.handleModalSubmit) await c.handleModalSubmit(interaction); return; }
                if (id.startsWith('tb_modal_'))  { const c = this.commands.get('tb');  if (c?.handleModalSubmit)  await c.handleModalSubmit(interaction);  return; }
                return;
            }
            if (interaction.isButton()) {
                const id = interaction.customId;
                if (id.startsWith('appeal_open_'))       { const uid=id.replace('appeal_open_','');       if(interaction.user.id!==uid) return interaction.reply({content:'❌ Không phải form của bạn!',ephemeral:true}); const c=this.commands.get('appeal');    if(c?.handleOpenButton) await c.handleOpenButton(interaction); return; }
                if (id.startsWith('feedback_open_'))     { const uid=id.replace('feedback_open_','');     if(interaction.user.id!==uid) return interaction.reply({content:'❌ Không phải form của bạn!',ephemeral:true}); const c=this.commands.get('feedbacks'); if(c?.handleOpenButton) await c.handleOpenButton(interaction); return; }
                if (id.startsWith('approve_appeal_'))    { if(!Config.isOwner(interaction.user.id)) return interaction.reply({content:'❌ Chỉ admin!',ephemeral:true}); const c=this.commands.get('appeal');    if(c?.handleApprove)    await c.handleApprove(interaction,    id.replace('approve_appeal_','')); return; }
                if (id.startsWith('deny_appeal_'))       { if(!Config.isOwner(interaction.user.id)) return interaction.reply({content:'❌ Chỉ admin!',ephemeral:true}); const c=this.commands.get('appeal');    if(c?.handleDeny)       await c.handleDeny(interaction,       id.replace('deny_appeal_','')); return; }
                if (id.startsWith('feedback_reply_btn_')){ if(!Config.isOwner(interaction.user.id)) return interaction.reply({content:'❌ Chỉ admin!',ephemeral:true}); const c=this.commands.get('feedbacks'); if(c?.handleReplyButton) await c.handleReplyButton(interaction, id.replace('feedback_reply_btn_','')); return; }
                if (id.startsWith('tb_open_'))           { if(!Config.isOwner(interaction.user.id)) return interaction.reply({content:'❌ Chỉ admin!',ephemeral:true}); const c=this.commands.get('tb');       if(c?.handleOpenButton) await c.handleOpenButton(interaction); return; }
                if (id.startsWith('tb_cancel_'))         { if(!Config.isOwner(interaction.user.id)) return interaction.reply({content:'❌ Chỉ admin!',ephemeral:true}); const c=this.commands.get('tb');       if(c?.handleCancelButton) await c.handleCancelButton(interaction); return; }
                return;
            }
            if (interaction.isChatInputCommand()) { const c = this.commands.get(interaction.commandName); if (c) await c.execute(interaction); }
        } catch (e) {
            Logger.error('Interaction error:', e);
            try { if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Có lỗi.', ephemeral: true }); } catch {}
        }
    }

    async start() {
        Logger.info('Connecting to Discord...');
        await this.client.login(Config.DISCORD_TOKEN);
        Logger.success('Bot logged in');
        return this.client;
    }

    async stop() {
        this.privateManager.stopCleanup();
        try { await this.client.destroy(); } catch {}
        Logger.success('Bot stopped');
    }
}

module.exports = DiscordBot;
