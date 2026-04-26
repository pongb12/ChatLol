const { EmbedBuilder } = require('discord.js');
const Config = require('../utils/config');
const Logger = require('../utils/logger');
const Firebase = require('../utils/firebase');

module.exports = {
    name: 'profile',
    description: 'Xem thông tin cá nhân',
    cooldown: 5,

    async execute(message, args) {
        const userId = message.author.id;

        try {
            const user = await Firebase.getUser(userId);
            if (!user) {
                return message.reply(`❌ Bạn chưa đăng ký! Gõ \`${Config.PREFIX}signup\`.`);
            }

            // Check login
            if (!user.isLoggedIn) {
                return message.reply(`🔒 Bạn chưa đăng nhập. Gõ \`${Config.PREFIX}login\`.`);
            }

            // Send via DM for privacy
            const dmChannel = await message.author.createDM();

            const quota = user.quota || {};
            const instantUsed = quota.instant?.dailyRequests || 0;
            const thinkingUsed = quota.thinking?.dailyUses || 0;

            const embed = new EmbedBuilder()
                .setColor(0x7289DA)
                .setTitle('👤 Hồ sơ của bạn')
                .setThumbnail(message.author.displayAvatarURL())
                .addFields(
                    { name: '🆔 ID', value: user.discordId || userId, inline: true },
                    { name: '📛 Tag', value: user.idUsername || message.author.tag, inline: true },
                    { name: '📅 Đăng ký', value: user.registeredAt?.toDate?.().toLocaleString('vi-VN') || 'N/A', inline: true },
                    { name: '⏰ Session', value: user.isPermanentAdmin ? '👑 Vĩnh viễn' : (user.sessionExpires?.toDate?.().toLocaleString('vi-VN') || 'N/A'), inline: true },
                    { name: '🧠 Model', value: user.preferredModel === 'thinking' ? '🧠 Thinking' : '⚡ Instant', inline: true },
                    { name: '📊 Tổng tin nhắn', value: (user.stats?.totalMessages || 0).toString(), inline: true },
                    { name: '⚡ Instant', value: `${instantUsed}/${Config.INSTANT_DAILY_LIMIT} hôm nay`, inline: true },
                    { name: '🧠 Thinking', value: `${thinkingUsed}/${Config.THINKING_DAILY_LIMIT} hôm nay`, inline: true }
                )
                .setFooter({ text: `Lol.AI v${Config.BOT_VERSION}` })
                .setTimestamp();

            await dmChannel.send({ embeds: [embed] });

            // Confirm in original channel
            if (message.channel.type !== 1 && !message.channel.isDMBased()) {
                const reply = await message.reply('📩 Đã gửi thông tin qua DM!');
                setTimeout(() => reply.delete().catch(() => {}), 3000);
            }

        } catch (error) {
            Logger.error('Profile error:', error);
            message.reply('❌ Lỗi. Thử lại!');
        }
    }
};
