const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Config = require('../utils/config');
const Logger = require('../utils/logger');
const Firebase = require('../utils/firebase');

module.exports = {
    name: 'clear',
    description: 'Xóa lịch sử chat',
    cooldown: 10,

    async execute(message, args) {
        const userId = message.author.id;

        try {
            const user = await Firebase.getUser(userId);
            if (!user) {
                return message.reply(`❌ Chưa đăng ký!`);
            }
            if (!user.isLoggedIn && !Config.isOwner(userId)) {
                return message.reply(`🔒 Chưa đăng nhập!`);
            }

            // DM for privacy
            const dmChannel = await message.author.createDM();

            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('🗑️ Xóa lịch sử')
                .setDescription('Bạn có chắc muốn xóa **toàn bộ** lịch sử chat?\n⚠️ **Không thể khôi phục!**')
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('clear_confirm')
                    .setLabel('Xóa')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🗑️'),
                new ButtonBuilder()
                    .setCustomId('clear_cancel')
                    .setLabel('Hủy')
                    .setStyle(ButtonStyle.Secondary)
            );

            const msg = await dmChannel.send({ embeds: [embed], components: [row] });

            const collector = msg.createMessageComponentCollector({
                filter: i => i.user.id === userId,
                time: 30000,
                max: 1
            });

            collector.on('collect', async (i) => {
                if (i.customId === 'clear_confirm') {
                    await Firebase.clearHistory(userId);
                    await i.update({
                        content: '✅ Đã xóa toàn bộ lịch sử!',
                        embeds: [],
                        components: []
                    });
                    Logger.info(`Cleared history: ${message.author.tag}`);
                } else {
                    await i.update({
                        content: '❌ Đã hủy.',
                        embeds: [],
                        components: []
                    });
                }
            });

            if (message.channel.type !== 1 && !message.channel.isDMBased()) {
                message.reply('📩 Kiểm tra DM để xác nhận xóa!');
            }

        } catch (error) {
            Logger.error('Clear error:', error);
            message.reply('❌ Lỗi. Thử lại!');
        }
    }
};
