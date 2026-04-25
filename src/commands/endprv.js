const Config = require('../utils/config');
const Logger = require('../utils/logger');

module.exports = {
    name: 'endprv',
    description: 'Đóng private chat',
    cooldown: 5,

    async execute(message, args, context) {
        const { privateManager, bot } = context;
        const userId = message.author.id;

        const chat = privateManager.getChat(userId);
        if (!chat) {
            return message.reply('❌ Bạn không có private chat nào!');
        }

        if (message.channel.id !== chat.channelId) {
            return message.reply(`❌ Lệnh này chỉ dùng trong private chat!`);
        }

        await privateManager.endChat(bot.client, userId, 'User request');
        Logger.info(`End private: ${message.author.tag}`);
    }
};
