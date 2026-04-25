const { EmbedBuilder } = require('discord.js');
const { FieldValue } = require('firebase-admin/firestore');
const Config = require('../utils/config');
const Logger = require('../utils/logger');
const Firebase = require('../utils/firebase');

module.exports = {
    name: 'confirm',
    description: 'Xác nhận hoạt động',
    cooldown: 5,

    async execute(message, args) {
        try {
            await Firebase.updateUser(message.author.id, {
                lastActive: FieldValue.serverTimestamp()
            });

            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('✅ Đã xác nhận')
                .setDescription('Tài khoản của bạn đã được xác nhận hoạt động!')
                .setTimestamp();

            message.reply({ embeds: [embed] });
            Logger.info(`Confirm: ${message.author.tag}`);

        } catch (error) {
            Logger.error('Confirm error:', error);
            message.reply('❌ Lỗi. Thử lại!');
        }
    }
};
