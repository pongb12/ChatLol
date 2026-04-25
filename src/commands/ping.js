const { EmbedBuilder } = require('discord.js');
const Config = require('../utils/config');

module.exports = {
    name: 'ping',
    description: 'Kiểm tra độ trễ',
    cooldown: 5,

    async execute(message, args) {
        const start = Date.now();
        const sent = await message.reply('🏓 Pong!');
        const total = Date.now() - start;
        const ws = Math.round(message.client.ws.ping);

        let color = 0x00FF00;
        let status = '✅ Tốt';
        if (total > 500) { color = 0xFFFF00; status = '🟡 Bình thường'; }
        if (total > 1000) { color = 0xFF0000; status = '🔴 Chậm'; }

        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle('🏓 Pong!')
            .addFields(
                { name: '⏱️ Tổng', value: `${total}ms`, inline: true },
                { name: '📶 WS', value: `${ws}ms`, inline: true },
                { name: '📊 Trạng thái', value: status, inline: false }
            )
            .setFooter({ text: `Lol.AI v${Config.BOT_VERSION}` })
            .setTimestamp();

        await sent.edit({ content: '', embeds: [embed] });
    }
};
