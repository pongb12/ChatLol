const { EmbedBuilder } = require('discord.js');
const Config = require('../utils/config');

module.exports = {
    name: 'intro',
    description: 'Giới thiệu bot',
    cooldown: 10,

    async execute(message, args) {
        const embed = new EmbedBuilder()
            .setColor(0xFF3366)
            .setTitle(`🤖 ${Config.BOT_NAME} v${Config.BOT_VERSION}`)
            .setDescription('Trợ lý AI của server Lol 🎮')
            .addFields(
                { name: '⚡ Instant', value: 'Tốc độ nhanh' },
                { name: '🧠 Thinking', value: 'Phân tích sâu' },
                { name: '🔒 Private', value: 'Chat riêng tư' },
                { name: '📋 Bắt đầu', value: `\`${Config.PREFIX}signup\` → \`${Config.PREFIX}login\` → \`${Config.PREFIX}ask\`` }
            )
            .setFooter({ text: 'Powered by Groq' })
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    }
};
