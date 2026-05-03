const { EmbedBuilder } = require('discord.js');
const Config = require('../utils/config');
const Logger = require('../utils/logger');
const Firebase = require('../utils/firebase');
const { formatVN } = require('../utils/time');

module.exports = {
    name: 'profile',
    description: 'Xem thông tin cá nhân | Admin: .profile <userId>',
    cooldown: 5,

    async execute(message, args) {
        const requesterId = message.author.id;
        const isAdmin = Config.isOwner(requesterId);

        // ===== ADMIN LOOKUP =====
        if (args.length > 0 && isAdmin) {
            const targetId = args[0].replace(/[<@!>]/g, '');

            if (!/^\d{17,20}$/.test(targetId)) {
                return message.reply('❌ User ID không hợp lệ! Dùng: `.profile <userId>`');
            }

            try {
                const targetUser = await Firebase.getUser(targetId);
                if (!targetUser) {
                    return message.reply(`❌ Không tìm thấy user \`${targetId}\` trong database.`);
                }

                let discordTag = targetUser.idUsername || targetId;
                let avatarURL = null;
                try {
                    const discordUser = await message.client.users.fetch(targetId);
                    discordTag = discordUser.tag;
                    avatarURL = discordUser.displayAvatarURL();
                } catch (_) {}

                const isBanned = await Firebase.isBanned(targetId);
                const embed = await buildProfileEmbed(targetUser, targetId, discordTag, avatarURL, isBanned, true);

                const dmChannel = await message.author.createDM();
                await dmChannel.send({ embeds: [embed] });

                if (message.channel.type !== 1 && !message.channel.isDMBased()) {
                    const reply = await message.reply(`📩 Đã gửi thông tin của \`${discordTag}\` qua DM!`);
                    setTimeout(() => reply.delete().catch(() => {}), 4000);
                }

                Logger.info(`Admin profile lookup: ${targetId} by ${message.author.tag}`);
            } catch (error) {
                Logger.error('Admin profile lookup error:', error);
                message.reply('❌ Lỗi tra cứu. Thử lại!');
            }
            return;
        }

        // ===== NORMAL USER =====
        try {
            const user = await Firebase.getUser(requesterId);
            if (!user) {
                return message.reply(`❌ Bạn chưa đăng ký! Gõ \`${Config.PREFIX}signup\`.`);
            }

            if (!user.isLoggedIn && !isAdmin) {
                return message.reply(`🔒 Bạn chưa đăng nhập. Gõ \`${Config.PREFIX}login\`.`);
            }

            const isBanned = await Firebase.isBanned(requesterId);
            const embed = await buildProfileEmbed(
                user,
                requesterId,
                message.author.tag,
                message.author.displayAvatarURL(),
                isBanned,
                false
            );

            const dmChannel = await message.author.createDM();
            await dmChannel.send({ embeds: [embed] });

            if (message.channel.type !== 1 && !message.channel.isDMBased()) {
                const reply = await message.reply('📩 Đã gửi thông tin qua DM!');
                setTimeout(() => reply.delete().catch(() => {}), 3000);
            }

        } catch (error) {
            Logger.error('Profile error:', error);
            message.reply('❌ Lỗi. Thử lại!');
        }
    }
};

/* ================= BUILD EMBED ================= */
async function buildProfileEmbed(user, userId, discordTag, avatarURL, isBanned, isAdminView) {
    const quota = user.quota || {};

    const instantUsed = quota.instant?.dailyRequests ?? 0;
    const thinkingUsed = quota.thinking?.dailyRequests ?? quota.thinking?.dailyUses ?? 0;

    const instantLimit = Config.INSTANT_DAILY_LIMIT;
    const thinkingLimit = Config.THINKING_DAILY_LIMIT;

    const instantBar = buildBar(instantUsed, instantLimit);
    const thinkingBar = buildBar(thinkingUsed, thinkingLimit);

    // FIX: dùng formatVN cho tất cả timestamp → hiện đúng giờ VN
    const instantResetDate = quota.instant?.lastReset?.toDate?.();
    const thinkingResetDate = quota.thinking?.lastReset?.toDate?.();
    const sessionExpires = user.sessionExpires?.toDate?.();
    const registeredAt = user.registeredAt?.toDate?.() || user.createdAt?.toDate?.();
    const lastActive = user.lastActive?.toDate?.();

    const embed = new EmbedBuilder()
        .setColor(isAdminView ? 0xFFD700 : 0x7289DA)
        .setTitle(isAdminView ? `👑 Admin View — ${discordTag}` : '👤 Hồ sơ của bạn')
        .addFields(
            {
                name: '🆔 Discord',
                value: `${discordTag}\n\`${userId}\``,
                inline: true
            },
            {
                name: '📅 Đăng ký',
                value: formatVN(registeredAt),
                inline: true
            },
            {
                name: '🕒 Hoạt động',
                value: formatVN(lastActive),
                inline: true
            },
            {
                name: '🔐 Session',
                value: user.isPermanentAdmin
                    ? '👑 Vĩnh viễn (Admin)'
                    : formatVN(sessionExpires),
                inline: true
            },
            {
                name: '🧠 Model',
                value: user.preferredModel === 'thinking' ? '🧠 Thinking' : '⚡ Instant',
                inline: true
            },
            {
                name: '📊 Tổng tin nhắn',
                value: (user.stats?.totalMessages ?? 0).toString(),
                inline: true
            },
            {
                name: `⚡ Instant hôm nay`,
                value: `${instantBar}\n${instantUsed}/${instantLimit} lượt${instantResetDate ? `\nReset: ${formatVN(instantResetDate)}` : ''}`,
                inline: false
            },
            {
                name: `🧠 Thinking hôm nay`,
                value: `${thinkingBar}\n${thinkingUsed}/${thinkingLimit} lượt${thinkingResetDate ? `\nReset: ${formatVN(thinkingResetDate)}` : ''}`,
                inline: false
            }
        );

    if (isAdminView) {
        embed.addFields(
            {
                name: '🔒 Trạng thái',
                value: [
                    `Login: ${user.isLoggedIn ? '✅' : '❌'}`,
                    `Admin: ${user.isPermanentAdmin ? '✅' : '❌'}`,
                    `Banned: ${isBanned ? '🚫 Có' : '✅ Không'}`
                ].join('\n'),
                inline: true
            }
        );
    }

    if (avatarURL) embed.setThumbnail(avatarURL);
    embed.setFooter({ text: `Lol.AI v${Config.BOT_VERSION}` }).setTimestamp();

    return embed;
}

/* ================= BAR ================= */
function buildBar(used, limit, length = 10) {
    const filled = limit > 0 ? Math.round((used / limit) * length) : 0;
    const empty = length - filled;
    const bar = '▓'.repeat(Math.max(0, filled)) + '░'.repeat(Math.max(0, empty));
    const pct = limit > 0 ? Math.round((used / limit) * 100) : 0;
    return `\`${bar}\` ${pct}%`;
}
