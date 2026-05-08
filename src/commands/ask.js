const { FieldValue } = require('firebase-admin/firestore');
const Config   = require('../utils/config');
const Logger   = require('../utils/logger');
const Firebase = require('../utils/firebase');
const AI       = require('../ai');

module.exports = {
    name: 'ask',
    description: 'Chat với AI',
    usage: '.ask <câu hỏi>',
    cooldown: 5,

    async execute(message, args, context) {
        const userId   = message.author.id;
        const serverId = context?.serverId || null; // null nếu DM

        try {
            // Auth: luôn check từ global
            const user = await Firebase.getUser(userId);
            if (!user) return message.reply(`❌ Chưa đăng ký! Gõ \`${Config.PREFIX}signup\`.`);
            if (!user.isLoggedIn && !Config.isOwner(userId)) return message.reply(`🔒 Chưa đăng nhập! Gõ \`${Config.PREFIX}login\`.`);
            if (await Firebase.isBanned(userId)) return message.reply('🚫 Bạn đã bị chặn. Dùng `.appeal`.');

            if (!args.length) return message.reply(`Ví dụ: \`${Config.PREFIX}ask Chào Lol.AI!\``);

            // Nếu trong guild: đảm bảo server user đã được copy từ global
            if (serverId) await Firebase.ensureServerUser(serverId, userId).catch(() => {});

            const question = args.join(' ');
            const model    = user.preferredModel || 'instant';

            message.channel.sendTyping().catch(() => {});

            const response = await AI.ask(userId, question, model, serverId);

            await Firebase.updateUser(userId, {
                'stats.totalMessages': FieldValue.increment(1),
                lastActive: FieldValue.serverTimestamp()
            });

            if (response.length > 1900) {
                await message.reply(response.substring(0, 1900));
                await message.channel.send(response.substring(1900));
            } else {
                await message.reply(response);
            }

            Logger.info(`Ask [${model}]${serverId ? `[${serverId.slice(-4)}]` : '[DM]'} by ${message.author.tag}`);

        } catch (e) {
            Logger.error('Ask error:', e);
            message.reply('❌ Có lỗi. Thử lại!');
        }
    }
};
