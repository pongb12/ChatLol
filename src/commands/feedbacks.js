const { EmbedBuilder } = require('discord.js');
const Config = require('../utils/config');
const Logger = require('../utils/logger');

module.exports = {
    name: 'feedbacks',
    description: 'Gửi phản hồi',
    usage: '.feedbacks <tiêu đề> | <nội dung>',
    cooldown: 60,

    async execute(message, args) {
        try {
            if (!args.length) {
                return message.reply(
                    `📢 **Cách dùng:** \`${Config.PREFIX}feedbacks <tiêu đề> | <nội dung>\`\n` +
                    `**Ví dụ:** \`${Config.PREFIX}feedbacks Đề xuất | Bot nên có tính năng dịch thuật\``
                );
            }

            const full = args.join(' ');
            const parts = full.split('|');

            if (parts.length < 2 || !parts[0].trim() || !parts[1].trim()) {
                return message.reply(`❌ Thiếu tiêu đề hoặc nội dung!\n📌 Format: \`${Config.PREFIX}feedbacks <tiêu đề> | <nội dung>\``);
            }

            const title = parts[0].trim().slice(0, 100);
            const content = parts.slice(1).join('|').trim().slice(0, 1000);

            if (content.length < 10) {
                return message.reply('❌ Nội dung quá ngắn! Tối thiểu 10 ký tự.');
            }

            const owner = await message.client.users.fetch(Config.OWNER_ID).catch(() => null);
            if (owner) {
                const embed = new EmbedBuilder()
                    .setColor(0xFFA500)
                    .setTitle('📢 Phản hồi mới')
                    .addFields(
                        { name: '👤 User', value: `${message.author.tag} (${message.author.id})` },
                        { name: '📌 Tiêu đề', value: title },
                        { name: '📝 Nội dung', value: content }
                    )
                    .setTimestamp();

                await owner.send({ embeds: [embed] }).catch(() => {});
            }

            await message.reply('✅ Đã gửi phản hồi! Cảm ơn bạn.');
            Logger.info(`Feedback from ${message.author.tag}: ${title}`);

        } catch (error) {
            Logger.error('Feedback error:', error);
            message.reply('❌ Lỗi gửi phản hồi. Thử lại!');
        }
    }
};
