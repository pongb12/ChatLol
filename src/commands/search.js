const { FieldValue } = require('firebase-admin/firestore');
const Config   = require('../utils/config');
const Logger   = require('../utils/logger');
const Firebase = require('../utils/firebase');
const AI       = require('../ai');

module.exports = {
    name: 'search',
    description: 'Tìm kiếm thông tin',
    usage: '.search <truy vấn>',
    cooldown: 5,

    async execute(message, args, context) {
        const userId   = message.author.id;
        const serverId = context?.serverId || null;

        try {
            const user = await Firebase.getUser(userId);
            if (!user) return message.reply(`❌ Chưa đăng ký! Gõ \`${Config.PREFIX}signup\`.`);
            if (!user.isLoggedIn && !Config.isOwner(userId)) return message.reply(`🔒 Chưa đăng nhập! Gõ \`${Config.PREFIX}login\`.`);
            if (!args.length) return message.reply(`Ví dụ: \`${Config.PREFIX}search thủ đô Việt Nam\``);

            if (serverId) await Firebase.ensureServerUser(serverId, userId).catch(() => {});

            const query = args.join(' ');
            const model = user.preferredModel || 'instant';

            message.channel.sendTyping().catch(() => {});
            const response = await AI.search(userId, query, model, serverId);

            await Firebase.updateUser(userId, {
                'stats.totalMessages': FieldValue.increment(1),
                lastActive: FieldValue.serverTimestamp()
            });

            await message.reply(response);
            Logger.info(`Search${serverId ? `[${serverId.slice(-4)}]` : '[DM]'} by ${message.author.tag}`);

        } catch (e) {
            Logger.error('Search error:', e);
            message.reply('❌ Lỗi tìm kiếm. Thử lại!');
        }
    }
};
