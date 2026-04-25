const { Events } = require('discord.js');
const Config = require('../utils/config');
const Logger = require('../utils/logger');

module.exports = {
    name: Events.MessageCreate,

    async execute(message) {
        try {
            if (message.author.bot) return;

            const botInstance = message.client.botInstance;
            if (!botInstance) return;

            // Check private chat
            const privateManager = botInstance.privateManager;
            if (privateManager) {
                const privateData = privateManager.getChat(message.author.id);
                if (privateData && message.channel.id === privateData.channelId) {
                    privateManager.updateActivity(message.author.id);
                    await botInstance.handlePrivateMessage(message);
                    return;
                }
            }

            // DM without command
            if (message.channel.type === 1 || message.channel.isDMBased) {
                if (!message.content.startsWith(Config.PREFIX)) return;
                await botInstance.handleCommand(message);
                return;
            }

            // Guild commands
            if (!message.content.startsWith(Config.PREFIX)) return;
            await botInstance.handleCommand(message);

        } catch (error) {
            Logger.error('MessageCreate error:', error);
        }
    }
};
