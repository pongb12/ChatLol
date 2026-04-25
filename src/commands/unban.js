const { EmbedBuilder } = require('discord.js');
const Config = require('../utils/config');
const Logger = require('../utils/logger');
const Firebase = require('../utils/firebase');

module.exports = {
    name: 'unban',
    description: 'Gỡ ban user (admin)',
    usage: '.unban <userId>',
    cooldown: 5,

    async execute(message, args) {
        if (!Config.isOwner(message.author.id)) {
            return message.reply('❌ Chỉ admin!');
        }

        if (!args.length) {
            return message.reply(`Cách dùng: \`${Config.PREFIX}unban <userId>\``);
        }

        const targetId = args[0];

        if (!/^\d{17,20}$/.test(targetId)) {
            return message.reply('❌ User ID không hợp lệ!');
        }

        try {
            await Firebase.unbanUser(targetId);

            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('🔓 ĐÃ GỠ BAN')
                .addFields(
                    { name: '🆔 ID', value: targetId },
                    { name: '👮 Bởi', value: message.author.tag }
                )
                .setTimestamp();

            await message.reply({ embeds: [embed] });
            Logger.warn(`Unban: ${targetId} by ${message.author.tag}`);

            const target = await message.client.users.fetch(targetId).catch(() => null);
            if (target) {
                await target.send('🔓 Bạn đã được gỡ ban! Có thể sử dụng bot bình thường.').catch(() => {});
            }

        } catch (error) {
            Logger.error('Unban error:', error);
            message.reply('❌ Lỗi. Thử lại!');
        }
    }
};
