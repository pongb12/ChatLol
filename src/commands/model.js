const { EmbedBuilder } = require('discord.js');
const Config = require('../utils/config');
const Logger = require('../utils/logger');
const Firebase = require('../utils/firebase');

module.exports = {
    name: 'model',
    description: 'Chuyển đổi model AI',
    usage: '.model [instant|thinking]',
    cooldown: 5,

    async execute(message, args) {
        const userId = message.author.id;

        try {
            const user = await Firebase.getUser(userId);
            if (!user) {
                return message.reply(`❌ Chưa đăng ký! Gõ \`${Config.PREFIX}signup\`.`);
            }
            if (!user.isLoggedIn) {
                return message.reply(`🔒 Chưa đăng nhập! Gõ \`${Config.PREFIX}login\`.`);
            }

            const currentModel = user.preferredModel || 'instant';

            if (!args.length) {
                // Show current model
                const embed = new EmbedBuilder()
                    .setColor(0x0099FF)
                    .setTitle('🧠 Model hiện tại')
                    .setDescription(`Bạn đang dùng: **${currentModel === 'thinking' ? '🧠 Thinking' : '⚡ Instant'}**`)
                    .addFields(
                        { name: '⚡ Instant', value: `Tốc độ nhanh, ${Config.INSTANT_MAX_CHARS} ký tự, CD ${Config.INSTANT_COOLDOWN}s`, inline: false },
                        { name: '🧠 Thinking', value: `Phân tích sâu, ${Config.THINKING_MAX_CHARS} ký tự, CD ${Config.THINKING_COOLDOWN}s`, inline: false }
                    )
                    .setFooter({ text: `Dùng ${Config.PREFIX}model instant|thinking để đổi` })
                    .setTimestamp();
                return message.reply({ embeds: [embed] });
            }

            const choice = args[0].toLowerCase();

            if (choice === 'instant') {
                await Firebase.updateUser(userId, { preferredModel: 'instant' });
                return message.reply('⚡ Đã chuyển sang **Instant**!');
            }

            if (choice === 'thinking') {
                // Check if has quota
                const quota = user.quota?.thinking;
                if (quota && quota.dailyUses >= Config.THINKING_DAILY_LIMIT) {
                    return message.reply(`🚫 Bạn đã dùng hết ${Config.THINKING_DAILY_LIMIT} lượt Thinking hôm nay. Reset 7h sáng mai.`);
                }
                await Firebase.updateUser(userId, { preferredModel: 'thinking' });
                return message.reply('🧠 Đã chuyển sang **Thinking**!');
            }

            message.reply(`❌ Model không hợp lệ. Dùng: \`${Config.PREFIX}model instant\` hoặc \`${Config.PREFIX}model thinking\``);

        } catch (error) {
            Logger.error('Model error:', error);
            message.reply('❌ Lỗi. Thử lại!');
        }
    }
};
