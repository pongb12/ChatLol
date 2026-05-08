const { EmbedBuilder } = require('discord.js');
const Config   = require('../utils/config');
const Logger   = require('../utils/logger');
const Firebase = require('../utils/firebase');
const { formatVN } = require('../utils/time');

module.exports = {
    name: 'acpt',
    description: 'Cấp phép server (admin)',
    usage: '.acpt <serverId>',
    cooldown: 3,

    async execute(message, args, context) {
        if (!Config.isOwner(message.author.id)) return message.reply('❌ Chỉ admin!');

        if (!args.length) return message.reply(`Cách dùng: \`${Config.PREFIX}acpt <serverId>\`\nVí dụ: \`${Config.PREFIX}acpt 123456789012345678\``);

        const serverId = args[0].trim();
        if (!/^\d{17,20}$/.test(serverId)) return message.reply('❌ Server ID không hợp lệ!');

        if (Config.isHomeServer(serverId)) return message.reply('ℹ️ Đây là home server — đã được cấp phép mặc định qua `SERVER_ID` env.');

        try {
            // Thử lấy tên server từ Discord
            let guildName = 'Unknown';
            let memberCount = 'N/A';
            try {
                const guild = await message.client.guilds.fetch(serverId);
                if (guild) { guildName = guild.name; memberCount = guild.memberCount?.toString() || 'N/A'; }
            } catch { guildName = `Server ${serverId}`; }

            // Check xem đã acpt chưa
            const existing = await Firebase.getServer(serverId);
            if (existing?.acpted) {
                return message.reply(`ℹ️ Server **${existing.guildName || guildName}** đã được cấp phép rồi.`);
            }

            await Firebase.acptServer(serverId, {
                guildName,
                memberCount,
                acptedBy: message.author.id
            });

            // Clear auth cache để có hiệu lực ngay
            if (context?.bot) context.bot.clearAuthCache(serverId);

            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('✅ Đã cấp phép server')
                .addFields(
                    { name: '🏠 Server', value: guildName,   inline: true },
                    { name: '🆔 ID',     value: serverId,     inline: true },
                    { name: '👥 Members', value: memberCount, inline: true }
                )
                .setFooter({ text: `Cấp phép bởi ${message.author.tag}` })
                .setTimestamp();

            await message.reply({ embeds: [embed] });

            // Thông báo tới guild nếu bot đang ở đó
            try {
                const guild = await message.client.guilds.fetch(serverId);
                if (guild) {
                    const systemChannel = guild.systemChannel;
                    if (systemChannel) {
                        await systemChannel.send(`✅ **${Config.BOT_NAME}** đã được xác thực cho server này! Dùng \`${Config.PREFIX}help\` để bắt đầu.`).catch(() => {});
                    }
                }
            } catch {}

            Logger.success(`✅ Server acpted: ${guildName} (${serverId}) by ${message.author.tag}`);

        } catch (error) {
            Logger.error('Acpt error:', error);
            message.reply('❌ Lỗi cấp phép. Thử lại!');
        }
    }
};
