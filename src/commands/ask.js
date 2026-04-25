const { EmbedBuilder } = require('discord.js');
const Config = require('../utils/config');
const Logger = require('../utils/logger');
const Firebase = require('../utils/firebase');
const AI = require('../ai');

module.exports = {
    name: 'ask',
    description: 'Chat với AI',
    usage: '.ask <câu hỏi>',
    cooldown: 5,

    async execute(message, args) {
        const userId = message.author.id;

        try {
            // Check guest
            const user = await Firebase.getUser(userId);
            if (!user) {
                const reply = await message.reply(`❌ Bạn chưa đăng ký!\n📩 Vui lòng **DM** bot gõ \`${Config.PREFIX}signup\` để đăng ký.`);
                setTimeout(() => reply.delete().catch(() => {}), 10000);
                return;
            }

            // Check login (admin permanent skip)
            if (!user.isLoggedIn && !Config.isOwner(userId)) {
                const reply = await message.reply(`🔒 Bạn chưa đăng nhập!\n📩 DM bot gõ \`${Config.PREFIX}login\`.`);
                setTimeout(() => reply.delete().catch(() => {}), 10000);
                return;
            }

            // Check ban
            const isBanned = await Firebase.isBanned(userId);
            if (isBanned) {
                return message.reply('🚫 Bạn đã bị chặn. Dùng `.appeal` để kháng cáo.');
            }

            // Check args
            if (!args.length) {
                const reply = await message.reply(`Vui lòng nhập câu hỏi! Ví dụ: \`${Config.PREFIX}ask Chào Lol.AI!\``);
                setTimeout(() => reply.delete().catch(() => {}), 5000);
                return;
            }

            const question = args.join(' ');
            const model = user.preferredModel || 'instant';

            message.channel.sendTyping();

            const response = await AI.ask(userId, question, model);

            // Save user message to history
            await Firebase.addHistory(userId, `user_${Date.now()}`, {
                role: 'user',
                content: question.slice(0, 100),
                model: model
            });

            // Update stats
            await Firebase.updateUser(userId, {
                'stats.totalMessages': Firebase.db.FieldValue.increment(1),
                lastActive: Firebase.db.FieldValue.serverTimestamp()
            });

            // Send response
            if (response.length > 1900) {
                await message.reply(response.substring(0, 1900));
                await message.channel.send(response.substring(1900));
            } else {
                await message.reply(response);
            }

            Logger.info(`Ask [${model}] by ${message.author.tag}`);

        } catch (error) {
            Logger.error('Ask error:', error);
            message.reply('❌ Có lỗi. Thử lại!');
        }
    }
};
