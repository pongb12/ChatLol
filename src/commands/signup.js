const { EmbedBuilder } = require('discord.js');
const { FieldValue } = require('firebase-admin/firestore');
const Config = require('../utils/config');
const Logger = require('../utils/logger');
const Firebase = require('../utils/firebase');

module.exports = {
    name: 'signup',
    description: 'Đăng ký tài khoản',
    cooldown: 10,

    async execute(message, args) {
        if (message.channel.type !== 1 && !message.channel.isDMBased()) {
            const reply = await message.reply('📩 Vui lòng đăng ký qua **DM** để bảo mật!');
            setTimeout(() => reply.delete().catch(() => {}), 5000);
            return;
        }

        const userId = message.author.id;

        try {
            const existing = await Firebase.getUser(userId);
            if (existing) {
                const embed = new EmbedBuilder()
                    .setColor(0xFFA500)
                    .setTitle('⚠️ Đã đăng ký')
                    .setDescription(`Bạn đã đăng ký rồi!\nGõ \`${Config.PREFIX}login\` để đăng nhập.`)
                    .setTimestamp();
                return message.reply({ embeds: [embed] });
            }

            const serverTime = FieldValue.serverTimestamp();

            const userData = {
                discordId: userId,
                idUsername: message.author.tag,
                registeredAt: serverTime,
                lastLogin: serverTime,
                lastActive: serverTime,
                sessionExpires: serverTime,
                isLoggedIn: false,
                isAdmin: Config.isOwner(userId),
                isPermanentAdmin: Config.isOwner(userId),
                preferredModel: 'instant',
                notifiedExpiry: false,
                quota: {
                    instant: {
                        dailyRequests: 0,
                        lastReset: serverTime,
                        maxPerDay: Config.INSTANT_DAILY_LIMIT
                    },
                    thinking: {
                        dailyUses: 0,
                        lastReset: serverTime,
                        maxPerDay: Config.THINKING_DAILY_LIMIT
                    }
                },
                stats: {
                    totalMessages: 0,
                    totalTokensUsed: 0,
                    favoriteModel: 'instant'
                }
            };

            await Firebase.createUser(userId, userData);

            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('✅ Đăng ký thành công!')
                .setDescription(`Chào mừng **${message.author.tag}**!\n\n🆔 ID: \`${userId}\`\n📅 Đăng ký: ${new Date().toLocaleString('vi-VN')}\n\nBạn muốn **login** luôn không?\nGõ \`${Config.PREFIX}login\` để đăng nhập.`)
                .addFields(
                    { name: '⚡ Instant', value: `${Config.INSTANT_DAILY_LIMIT} lượt/ngày, CD ${Config.INSTANT_COOLDOWN}s`, inline: true },
                    { name: '🧠 Thinking', value: `${Config.THINKING_DAILY_LIMIT} lượt/ngày, CD ${Config.THINKING_COOLDOWN}s`, inline: true }
                )
                .setFooter({ text: 'Session: 7 ngày | Reset quota: 7h sáng' })
                .setTimestamp();

            await message.reply({ embeds: [embed] });
            Logger.success(`New user: ${message.author.tag} (${userId})`);

        } catch (error) {
            Logger.error('Signup error:', error);
            message.reply('❌ Lỗi đăng ký. Thử lại sau!');
        }
    }
};
