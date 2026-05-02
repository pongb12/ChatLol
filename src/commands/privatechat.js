const { EmbedBuilder } = require('discord.js');
const Config = require('../utils/config');
const Logger = require('../utils/logger');
const Firebase = require('../utils/firebase');

module.exports = {
    name: 'privatechat',
    description: 'Tạo chat riêng tư với AI',
    cooldown: 30,

    async execute(message, args, context) {
        const userId = message.author.id;

        try {
            // ✅ FIX: Check auth trước khi tạo private chat
            const user = await Firebase.getUser(userId);
            if (!user) {
                return message.reply(`❌ Bạn chưa đăng ký! Gõ \`${Config.PREFIX}signup\` để đăng ký.`);
            }

            if (!user.isLoggedIn && !Config.isOwner(userId)) {
                return message.reply(`🔒 Bạn chưa đăng nhập! Gõ \`${Config.PREFIX}login\` để đăng nhập.`);
            }

            const { privateManager } = context;

            // Check if already has active chat
            const existing = privateManager.getChat(userId);
            if (existing) {
                return message.reply(`💬 Bạn đã có private chat rồi! Kiểm tra DM của bạn.\nGõ \`${Config.PREFIX}endprv\` để đóng chat hiện tại.`);
            }

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
