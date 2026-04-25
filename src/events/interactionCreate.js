const { Events } = require('discord.js');
const Logger = require('../utils/logger');

module.exports = {
    name: Events.InteractionCreate,

    async execute(interaction) {
        try {
            const botInstance = interaction.client.botInstance;
            if (!botInstance) return;

            await botInstance.handleInteraction(interaction);

        } catch (error) {
            Logger.error('InteractionCreate error:', error);
        }
    }
};
