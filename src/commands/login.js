const { EmbedBuilder } = require('discord.js');
const Config = require('../utils/config');
const Logger = require('../utils/logger');
const Firebase = require('../utils/firebase');

module.exports = {
    name: 'login',
    description: 'Đăng nhập',
    cooldown: 5,

    async execute(message, args) {
        if (message.channel.type !== 1 && !message.channel.isDMBased) {
            const reply = await message.reply('📩 Vui lòng đăng nhập qua **DM**!');
            setTimeout(() => reply.delete().catch(() => {}), 5000);
            return;
        }

        const userId = message.author.id;

        try {
            const user = await Firebase.getUser(userId);
            if (!user) {
                return message.reply(`❌ Bạn chưa đăng ký! Gõ \`${Config.PREFIX}signup\` trước.`);
            }

            // Admin permanent login
            if (Config.isOwner(userId)) {
                await Firebase.updateUser(userId, {
                    isLoggedIn: true,
                    isPermanentAdmin: true,
                    lastLogin: Firebase.db.FieldValue.serverTimestamp(),
                    lastActive: Firebase.db.FieldValue.serverTimestamp(),
                    notifiedExpiry: false
                });

                const embed = new EmbedBuilder()
                    .setColor(0xFFD700)
                    .setTitle('👑 Admin Login')
                    .setDescription(`Chào mừng **Admin** ${message.author.tag}!\n🔓 Đăng nhập vĩnh viễn.`)
                    .setTimestamp();

                return message.reply({ embeds: [embed] });
            }

            // Normal user
            const sessionExpires = new Date();
            sessionExpires.setDate(sessionExpires.getDate() + Config.SESSION_DAYS);

            await Firebase.updateUser(userId, {
                isLoggedIn: true,
                lastLogin: Firebase.db.FieldValue.serverTimestamp(),
                lastActive: Firebase.db.FieldValue.serverTimestamp(),
                sessionExpires: Firebase.db.Timestamp.fromDate(sessionExpires),
                notifiedExpiry: false
            });

            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('🔓 Đăng nhập thành công!')
                .setDescription(`Xin chào **${message.author.tag}**!\n\n⏰ Session hết hạn: ${sessionExpires.toLocaleString('vi-VN')}\n🔄 Gõ \`${Config.PREFIX}login\` để gia hạn.`)
                .setTimestamp();

            message.reply({ embeds: [embed] });
            Logger.info(`Login: ${message.author.tag}`);

        } catch (error) {
            Logger.error('Login error:', error);
            message.reply('❌ Lỗi đăng nhập. Thử lại!');
        }
    }
};
