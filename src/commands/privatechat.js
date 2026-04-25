const { EmbedBuilder } = require('discord.js');
const Config = require('../utils/config');
const Logger = require('../utils/logger');

module.exports = {
    name: 'privatechat',
    description: 'Tạo chat riêng tư với AI',
    cooldown: 30,

    async execute(message, args, context) {
        try {
            const { privateManager } = context;
            const dmChannel = await privateManager.createChat(message.author);

            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('🔒 Private Chat')
                .setDescription(`Đã tạo chat riêng!\n📩 Kiểm tra **DM** của bạn.`)
                .addFields(
                    { name: '⏳ Tự đóng', value: 'Sau 1h không hoạt động', inline: true },
                    { name: '🚫 Đóng ngay', value: `\`${Config.PREFIX}endprv\``, inline: true }
                )
                .setTimestamp();

            await message.reply({ embeds: [embed] });
            Logger.info(`Private chat: ${message.author.tag}`);

        } catch (error) {
            Logger.error('Private chat error:', error);
            message.reply('❌ Không thể tạo private chat. Đảm bảo bạn bật DM!');
        }
    }
};
