const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Config   = require('../utils/config');
const Logger   = require('../utils/logger');
const Firebase = require('../utils/firebase');
const { formatVN } = require('../utils/time');

const PAGE_SIZE = 5;

module.exports = {
    name: 'server',
    description: 'Xem danh sách server được cấp phép (admin)',
    usage: '.server | .server <serverId>',
    cooldown: 5,

    async execute(message, args) {
        if (!Config.isOwner(message.author.id)) return message.reply('❌ Chỉ admin!');

        // ── Xem 1 server cụ thể ──
        if (args.length > 0) {
            const serverId = args[0].trim();
            if (!/^\d{17,20}$/.test(serverId)) return message.reply('❌ Server ID không hợp lệ!');
            return this.showSingle(message, serverId);
        }

        // ── Xem tất cả ──
        return this.showAll(message);
    },

    async showSingle(message, serverId) {
        try {
            const isHome = Config.isHomeServer(serverId);

            // Lấy thông tin từ Firestore
            const data = await Firebase.getServer(serverId);

            // Lấy thêm từ Discord
            let guildName = data?.guildName || 'N/A';
            let memberCount = data?.memberCount || 'N/A';
            let guildOwner = 'N/A';
            let online = false;
            try {
                const guild = await message.client.guilds.fetch(serverId);
                if (guild) {
                    guildName   = guild.name;
                    memberCount = guild.memberCount?.toString() || 'N/A';
                    guildOwner  = guild.ownerId;
                    online      = true;
                }
            } catch {}

            if (!data && !isHome) return message.reply(`❌ Server \`${serverId}\` chưa được cấp phép hoặc không tồn tại trong database.`);

            const embed = new EmbedBuilder()
                .setColor(isHome ? 0xFFD700 : 0x7289DA)
                .setTitle(`🏠 ${guildName}`)
                .addFields(
                    { name: '🆔 Server ID',     value: serverId,                                    inline: true  },
                    { name: '✅ Trạng thái',     value: isHome ? '👑 Home Server' : (data?.acpted ? '✅ Đã cấp phép' : '❌ Chưa cấp phép'), inline: true },
                    { name: '🔗 Bot online',     value: online ? '✅ Có' : '❌ Không (bot không ở server này)', inline: true },
                    { name: '👥 Thành viên',     value: memberCount,                                 inline: true  },
                    { name: '👑 Server owner',   value: guildOwner !== 'N/A' ? `<@${guildOwner}>` : 'N/A', inline: true },
                    { name: '📊 Tổng requests',  value: (data?.totalRequests ?? 0).toString(),       inline: true  },
                    { name: '📅 Cấp phép lúc',   value: data?.acptedAt ? formatVN(data.acptedAt.toDate()) : (isHome ? 'Auto (env)' : 'N/A'), inline: false }
                )
                .setFooter({ text: `Lol.AI v${require('../utils/config').BOT_VERSION}` })
                .setTimestamp();

            const dmChannel = await message.author.createDM();
            await dmChannel.send({ embeds: [embed] });

            if (message.channel.type !== 1 && !message.channel.isDMBased()) {
                const r = await message.reply('📩 Đã gửi thông tin server qua DM!');
                setTimeout(() => r.delete().catch(() => {}), 4000);
            }

        } catch (e) {
            Logger.error('Server single error:', e);
            message.reply('❌ Lỗi. Thử lại!');
        }
    },

    async showAll(message) {
        try {
            const servers = await Firebase.getAllServers();

            // Thêm home server nếu chưa có trong DB
            const homeId = Config.SERVER_ID;
            const hasHome = servers.some(s => s.id === homeId);
            const allServers = hasHome || !homeId ? servers : [{ id: homeId, guildName: 'Home Server', acpted: true, totalRequests: 0, _isHome: true }, ...servers];

            if (!allServers.length) return message.reply('📭 Chưa có server nào được cấp phép.');

            const totalPages = Math.ceil(allServers.length / PAGE_SIZE);
            let page = 0;

            const buildEmbed = async (p) => {
                const slice = allServers.slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE);
                const embed = new EmbedBuilder()
                    .setColor(0xFFD700)
                    .setTitle('🏠 Danh sách Server được cấp phép')
                    .setFooter({ text: `Trang ${p+1}/${totalPages} • Tổng ${allServers.length} server` })
                    .setTimestamp();

                for (const s of slice) {
                    let name = s.guildName || s.id;
                    // Thử lấy tên live từ Discord
                    try {
                        const g = await message.client.guilds.fetch(s.id);
                        if (g) name = g.name;
                    } catch {}

                    const isHome = Config.isHomeServer(s.id);
                    embed.addFields({
                        name: `${isHome ? '👑' : '✅'} ${name}`,
                        value: `🆔 \`${s.id}\`\n📊 Requests: **${s.totalRequests ?? 0}**${s.acptedAt ? `\n📅 Acpted: ${formatVN(s.acptedAt.toDate?.() || new Date(s.acptedAt))}` : ''}`,
                        inline: false
                    });
                }
                return embed;
            };

            const buildRow = (p) => new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('sv_prev').setLabel('◀').setStyle(ButtonStyle.Secondary).setDisabled(p === 0),
                new ButtonBuilder().setCustomId('sv_page').setLabel(`${p+1}/${totalPages}`).setStyle(ButtonStyle.Primary).setDisabled(true),
                new ButtonBuilder().setCustomId('sv_next').setLabel('▶').setStyle(ButtonStyle.Secondary).setDisabled(p === totalPages - 1)
            );

            const dmChannel = await message.author.createDM();
            const msg = await dmChannel.send({
                embeds:     [await buildEmbed(page)],
                components: totalPages > 1 ? [buildRow(page)] : []
            });

            if (message.channel.type !== 1 && !message.channel.isDMBased()) {
                const r = await message.reply('📩 Đã gửi danh sách server qua DM!');
                setTimeout(() => r.delete().catch(() => {}), 4000);
            }

            if (totalPages <= 1) return;

            const collector = msg.createMessageComponentCollector({ filter: i => i.user.id === message.author.id, time: 120000 });
            collector.on('collect', async (interaction) => {
                if (interaction.customId === 'sv_prev' && page > 0) page--;
                else if (interaction.customId === 'sv_next' && page < totalPages - 1) page++;
                await interaction.update({ embeds: [await buildEmbed(page)], components: [buildRow(page)] });
            });
            collector.on('end', () => {
                const disabledRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('sv_prev').setLabel('◀').setStyle(ButtonStyle.Secondary).setDisabled(true),
                    new ButtonBuilder().setCustomId('sv_page').setLabel(`${page+1}/${totalPages}`).setStyle(ButtonStyle.Primary).setDisabled(true),
                    new ButtonBuilder().setCustomId('sv_next').setLabel('▶').setStyle(ButtonStyle.Secondary).setDisabled(true)
                );
                msg.edit({ components: [disabledRow] }).catch(() => {});
            });

        } catch (e) {
            Logger.error('Server all error:', e);
            message.reply('❌ Lỗi. Thử lại!');
        }
    }
};
