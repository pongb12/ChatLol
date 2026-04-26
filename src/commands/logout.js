const { EmbedBuilder } = require('discord.js');
const { FieldValue } = require('firebase-admin/firestore');
const Config = require('../utils/config');
const Logger = require('../utils/logger');
const Firebase = require('../utils/firebase');

module.exports = {
    name: 'logout',
    description: 'Đăng xuất',
    cooldown: 5,

    async execute(message, args) {
        if (message.channel.type !== 1 && !message.channel.isDMBased()) {
            const reply = await message.reply('📩 Vui lòng dùng lệnh này trong **DM**!');
            setTimeout(() => reply.delete().catch(() => {}), 5000);
            return;
        }

        try {
            await Firebase.updateUser(message.author.id, {
                isLoggedIn: false,
                sessionExpires: FieldValue.serverTimestamp()
            });

            const embed = new EmbedBuilder()
                .setColor(0x808080)
                .setTitle('🔒 Đã đăng xuất')
                .setDescription(`Tạm biệt **${message.author.tag}**!\nGõ \`${Config.PREFIX}login\` để đăng nhập lại.`)
                .setTimestamp();

            message.reply({ embeds: [embed] });
            Logger.info(`Logout: ${message.author.tag}`);

        } catch (error) {
            Logger.error('Logout error:', error);
            message.reply('❌ Lỗi đăng xuất.');
        }
    }
};
