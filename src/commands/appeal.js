const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Config = require('../utils/config');
const Logger = require('../utils/logger');
const Firebase = require('../utils/firebase');

module.exports = {
    name: 'appeal',
    description: 'Kháng cáo khi bị chặn',
    cooldown: 300,

    async execute(message, args) {
        const userId = message.author.id;

        try {
            const isBanned = await Firebase.isBanned(userId);
            if (!isBanned) {
                return message.reply('ℹ️ Bạn không bị chặn.');
            }

            if (!args.length) {
                return message.reply('Vui lòng cung cấp lý do kháng cáo!');
            }

            const reason = args.join(' ');
            const owner = await message.client.users.fetch(Config.OWNER_ID).catch(() => null);

            if (owner) {
                const embed = new EmbedBuilder()
                    .setColor(0xFFA500)
                    .setTitle('📢 KHÁNG CÁO')
                    .addFields(
                        { name: '👤 User', value: `${message.author.tag} (${userId})` },
                        { name: '📝 Lý do', value: reason },
                        { name: '🕒 Thở gian', value: new Date().toLocaleString('vi-VN') }
                    )
                    .setTimestamp();

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`approve_appeal_${userId}`)
                        .setLabel('Chấp nhận')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`deny_appeal_${userId}`)
                        .setLabel('Từ chối')
                        .setStyle(ButtonStyle.Danger)
                );

                await owner.send({ embeds: [embed], components: [row] }).catch(() => {});
            }

            message.reply('✅ Đã gửi kháng cáo. Chờ admin xử lý!');
            Logger.warn(`Appeal from ${message.author.tag}`);

        } catch (error) {
            Logger.error('Appeal error:', error);
            message.reply('❌ Lỗi. Thử lại!');
        }
    }
};
