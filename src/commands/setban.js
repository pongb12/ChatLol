const { EmbedBuilder } = require('discord.js');
const { Timestamp } = require('firebase-admin/firestore');
const Config = require('../utils/config');
const Logger = require('../utils/logger');
const Firebase = require('../utils/firebase');

module.exports = {
    name: 'setban',
    description: 'Ban user (admin)',
    usage: '.setban <userId> <số> <s/m/h/d>',
    cooldown: 5,

    async execute(message, args) {
        if (!Config.isOwner(message.author.id)) {
            return message.reply('❌ Chỉ admin!');
        }

        if (args.length < 3) {
            return message.reply(`Cách dùng: \`${Config.PREFIX}setban <userId> <số> <s/m/h/d>\``);
        }

        const targetId = args[0];
        const timeValue = parseInt(args[1]);
        const unit = args[2].toLowerCase();

        if (!/^\d{17,20}$/.test(targetId)) {
            return message.reply('❌ User ID không hợp lệ!');
        }

        if (targetId === Config.OWNER_ID) {
            return message.reply('❌ Không thể ban chính mình!');
        }

        if (isNaN(timeValue) || timeValue <= 0) {
            return message.reply('❌ Thời gian không hợp lệ!');
        }

        let duration = 0;
        let display = '';

        switch (unit) {
            case 's': duration = timeValue * 1000; display = `${timeValue} giây`; break;
            case 'm': duration = timeValue * 60 * 1000; display = `${timeValue} phút`; break;
            case 'h': duration = timeValue * 60 * 60 * 1000; display = `${timeValue} giờ`; break;
            case 'd': duration = timeValue * 24 * 60 * 60 * 1000; display = `${timeValue} ngày`; break;
            default: return message.reply('❌ Đơn vị: s/m/h/d');
        }

        if (duration > 365 * 24 * 60 * 60 * 1000) {
            return message.reply('❌ Tối đa 365 ngày!');
        }

        try {
            const expiresAt = new Date(Date.now() + duration);

            await Firebase.banUser(targetId, {
                bannedBy: message.author.id,
                reason: `Manual ban by ${message.author.tag}`,
                expiresAt: Timestamp.fromDate(expiresAt),
                isActive: true
            });

            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('🚫 ĐÃ BAN')
                .addFields(
                    { name: '🆔 ID', value: targetId },
                    { name: '⏳ Thời gian', value: display },
                    { name: '🕒 Hết hạn', value: expiresAt.toLocaleString('vi-VN') },
                    { name: '👮 Bởi', value: message.author.tag }
                )
                .setTimestamp();

            await message.reply({ embeds: [embed] });
            Logger.warn(`Ban: ${targetId} by ${message.author.tag} for ${display}`);

            const target = await message.client.users.fetch(targetId).catch(() => null);
            if (target) {
                await target.send(`🚫 Bạn đã bị ban ${display}.\n📞 Liên hệ admin để kháng cáo.`).catch(() => {});
            }

        } catch (error) {
            Logger.error('Setban error:', error);
            message.reply('❌ Lỗi. Thử lại!');
        }
    }
};
