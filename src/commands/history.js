const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Config = require('../utils/config');
const Logger = require('../utils/logger');
const Firebase = require('../utils/firebase');
const { formatVN } = require('../utils/time');

const PAGE_SIZE = 4; // Số Q&A mỗi trang
const MODEL_ICON = { instant: '⚡', thinking: '🧠' };

module.exports = {
    name: 'history',
    description: 'Xem lịch sử chat | Admin: .history <userId>',
    cooldown: 10,

    async execute(message, args) {
        const requesterId = message.author.id;
        const isAdmin = Config.isOwner(requesterId);

        // ===== ADMIN LOOKUP =====
        if (args.length > 0 && isAdmin) {
            const targetId = args[0].replace(/[<@!>]/g, '');
            if (!/^\d{17,20}$/.test(targetId)) return message.reply('❌ User ID không hợp lệ!');

            const targetUser = await Firebase.getUser(targetId).catch(() => null);
            if (!targetUser) return message.reply(`❌ Không tìm thấy user \`${targetId}\` trong database.`);

            let discordTag = targetUser.idUsername || targetId;
            try { const du = await message.client.users.fetch(targetId); discordTag = du.tag; } catch (_) {}

            const history = await Firebase.getHistory(targetId, 50).catch(() => []);
            if (!history.length) return message.reply(`📭 User \`${discordTag}\` chưa có lịch sử chat.`);

            const dmChannel = await message.author.createDM();
            await sendPaginatedHistory(dmChannel, requesterId, history, `👑 Lịch sử của ${discordTag}`, 0xFFD700);

            if (message.channel.type !== 1 && !message.channel.isDMBased()) {
                const reply = await message.reply(`📩 Đã gửi lịch sử của \`${discordTag}\` qua DM!`);
                setTimeout(() => reply.delete().catch(() => {}), 4000);
            }

            Logger.info(`Admin history lookup: ${targetId} by ${message.author.tag}`);
            return;
        }

        // ===== USER TỰ XEM (chỉ trong DM) =====
        if (message.channel.type !== 1 && !message.channel.isDMBased()) {
            const reply = await message.reply('📩 Lệnh này chỉ dùng trong **DM** để bảo mật!');
            setTimeout(() => reply.delete().catch(() => {}), 5000);
            return;
        }

        const user = await Firebase.getUser(requesterId).catch(() => null);
        if (!user) return message.reply(`❌ Bạn chưa đăng ký! Gõ \`${Config.PREFIX}signup\`.`);
        if (!user.isLoggedIn && !isAdmin) return message.reply(`🔒 Bạn chưa đăng nhập. Gõ \`${Config.PREFIX}login\`.`);

        const history = await Firebase.getHistory(requesterId, 50).catch(() => []);
        if (!history.length) {
            return message.reply('📭 Bạn chưa có lịch sử chat nào.\nHãy thử \`.ask <câu hỏi>\` để bắt đầu!');
        }

        await sendPaginatedHistory(message.channel, requesterId, history, '💬 Lịch sử chat của bạn', 0x7289DA);
        Logger.info(`History viewed: ${message.author.tag}`);
    }
};

/* ================= PAGINATOR ================= */
async function sendPaginatedHistory(channel, collectorUserId, history, title, color) {
    const totalPages = Math.ceil(history.length / PAGE_SIZE);
    let page = 0;

    const buildEmbed = (p) => {
        const start = p * PAGE_SIZE;
        const entries = history.slice(start, start + PAGE_SIZE);

        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(title)
            .setFooter({ text: `Trang ${p + 1}/${totalPages} • Tổng ${history.length} cuộc hội thoại • Lol.AI` })
            .setTimestamp();

        for (let i = 0; i < entries.length; i++) {
            const e = entries[i];
            const ts = e.timestamp?.toDate?.() || null;
            const timeStr = ts ? formatVN(ts) : 'N/A';
            const icon = MODEL_ICON[e.model] || '💬';
            const modelLabel = e.model === 'thinking' ? 'Thinking' : 'Instant';

            const q = truncate(e.question || '*(trống)*', 200);
            const a = truncate(e.answer   || '*(trống)*', 300);

            embed.addFields({
                name: `${icon} #${start + i + 1} — ${timeStr} [${modelLabel}]`,
                value: `**❓ Hỏi:** ${q}\n**🤖 Trả lời:** ${a}`,
                inline: false
            });

            // Đường kẻ ngăn cách (trừ entry cuối)
            if (i < entries.length - 1) {
                embed.addFields({ name: '\u200B', value: '─────────────────────', inline: false });
            }
        }

        return embed;
    };

    const buildRow = (p) => new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('hist_prev')
            .setLabel('◀ Trước')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(p === 0),
        new ButtonBuilder()
            .setCustomId('hist_page')
            .setLabel(`${p + 1} / ${totalPages}`)
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId('hist_next')
            .setLabel('Sau ▶')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(p === totalPages - 1)
    );

    const msg = await channel.send({
        embeds: [buildEmbed(page)],
        components: totalPages > 1 ? [buildRow(page)] : []
    });

    if (totalPages <= 1) return;

    const collector = msg.createMessageComponentCollector({
        filter: i => i.user.id === collectorUserId,
        time: 120000 // 2 phút
    });

    collector.on('collect', async (interaction) => {
        if (interaction.customId === 'hist_prev' && page > 0) page--;
        else if (interaction.customId === 'hist_next' && page < totalPages - 1) page++;

        await interaction.update({
            embeds: [buildEmbed(page)],
            components: [buildRow(page)]
        });
    });

    collector.on('end', () => {
        // Disable buttons khi hết thời gian
        const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('hist_prev').setLabel('◀ Trước').setStyle(ButtonStyle.Secondary).setDisabled(true),
            new ButtonBuilder().setCustomId('hist_page').setLabel(`${page + 1} / ${totalPages}`).setStyle(ButtonStyle.Primary).setDisabled(true),
            new ButtonBuilder().setCustomId('hist_next').setLabel('Sau ▶').setStyle(ButtonStyle.Secondary).setDisabled(true)
        );
        msg.edit({ components: [disabledRow] }).catch(() => {});
    });
}

function truncate(text, maxLen) {
    if (!text) return '*(trống)*';
    const clean = text.replace(/\n+/g, ' ').trim();
    return clean.length > maxLen ? clean.slice(0, maxLen) + '...' : clean;
}
