const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags // Import thêm để sửa lỗi Warning Ephemeral
} = require('discord.js');
const Config = require('../utils/config');
const Logger = require('../utils/logger');

// Lưu tạm channel target theo interactionId — tránh dùng global Map lâu dài
const pendingAnnounce = new Map(); // userId -> { channelId, timestamp }

module.exports = {
    name: 'tb',
    description: 'Gửi thông báo tới channel (admin)',
    usage: '.tb <channelId hoặc link channel>',
    cooldown: 5,

    async execute(message, args) {
        if (!Config.isOwner(message.author.id)) {
            return message.reply('❌ Chỉ admin!');
        }

        if (!args.length) {
            return message.reply(
                `❌ Thiếu channel!\n` +
                `Cách dùng: \`${Config.PREFIX}tb <channelId>\` hoặc \`${Config.PREFIX}tb <link channel>\``
            );
        }

        // Parse channel — hỗ trợ: ID thuần, <#id>, link discord
        const raw = args[0];
        let channelId = raw
            .replace(/^<#/, '')   // <#123>
            .replace(/>$/, '')
            .replace(/.*\/channels\/\d+\/(\d+).*/, '$1'); // link discord

        if (!/^\d{17,20}$/.test(channelId)) {
            return message.reply('❌ Channel không hợp lệ! Nhập ID, mention `#channel`, hoặc link channel.');
        }

        // Kiểm tra channel có tồn tại và bot có quyền gửi không
        let targetChannel;
        try {
            targetChannel = await message.client.channels.fetch(channelId);
        } catch {
            return message.reply('❌ Không tìm thấy channel. Kiểm tra lại ID!');
        }

        if (!targetChannel?.isTextBased()) {
            return message.reply('❌ Channel này không phải text channel!');
        }

        const perms = targetChannel.permissionsFor(message.client.user);
        if (perms && !perms.has('SendMessages')) {
            return message.reply('❌ Bot không có quyền gửi tin trong channel đó!');
        }

        // Lưu target tạm
        pendingAnnounce.set(message.author.id, {
            channelId,
            channelName: targetChannel.name,
            timestamp: Date.now()
        });

        // Hiện nút mở form
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`tb_open_${message.author.id}`)
                .setLabel('📝 Soạn thông báo')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`tb_cancel_${message.author.id}`)
                .setLabel('Hủy')
                .setStyle(ButtonStyle.Secondary)
        );

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('📢 Chuẩn bị thông báo')
            .setDescription(`Channel: <#${channelId}> (\`${targetChannel.name}\`)\n\nNhấn **Soạn thông báo** để mở form nhập nội dung.`)
            .setFooter({ text: 'Form sẽ hết hạn sau 5 phút' })
            .setTimestamp();

        await message.reply({ embeds: [embed], components: [row] });
    },

    async handleOpenButton(interaction) {
        const userId = interaction.user.id;
        const pending = pendingAnnounce.get(userId);

        // Kiểm tra hết hạn (5 phút)
        if (!pending || Date.now() - pending.timestamp > 300000) {
            pendingAnnounce.delete(userId);
            return interaction.reply({ 
                content: '⏰ Đã hết hạn. Dùng lại lệnh `.tb`!', 
                flags: [MessageFlags.Ephemeral] // Đã sửa lỗi Warning
            });
        }

        // Tối ưu hóa: Tạo modal nhanh nhất có thể để tránh lỗi "Unknown Interaction" (10062)
        const modal = new ModalBuilder()
            .setCustomId(`tb_modal_${userId}_${Date.now()}`)
            .setTitle('📢 Soạn Thông Báo');

        const titleInput = new TextInputBuilder()
            .setCustomId('tb_title')
            .setLabel('Tiêu đề thông báo')
            .setPlaceholder('Ví dụ: 🎉 Cập nhật mới | Để trống nếu không cần')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(256);

        const contentInput = new TextInputBuilder()
            .setCustomId('tb_content')
            .setLabel('Nội dung chính')
            // Fix lỗi String Length > 100: Rút ngắn placeholder xuống dưới 100 ký tự
            .setPlaceholder('Hỗ trợ: **đậm**, *nghiêng*, __gạch chân__, > trích dẫn, `code`...')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(3000);

        const colorInput = new TextInputBuilder()
            .setCustomId('tb_color')
            .setLabel('Màu embed (hex) — để trống = mặc định xanh')
            .setPlaceholder('Ví dụ: #FF0000 hoặc FF0000')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(7);

        const footerInput = new TextInputBuilder()
            .setCustomId('tb_footer')
            .setLabel('Footer — để trống nếu không cần')
            .setPlaceholder('Ví dụ: Lol.AI Team • 01/01/2026')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(200);

        const pingInput = new TextInputBuilder()
            .setCustomId('tb_ping')
            .setLabel('Ping — để trống nếu không ping ai')
            .setPlaceholder('@everyone | @here | để trống')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(20);

        modal.addComponents(
            new ActionRowBuilder().addComponents(titleInput),
            new ActionRowBuilder().addComponents(contentInput),
            new ActionRowBuilder().addComponents(colorInput),
            new ActionRowBuilder().addComponents(footerInput),
            new ActionRowBuilder().addComponents(pingInput)
        );

        // Gửi modal ngay lập tức
        await interaction.showModal(modal);
    },

    async handleCancelButton(interaction) {
        pendingAnnounce.delete(interaction.user.id);
        await interaction.update({
            content: '❌ Đã hủy thông báo.',
            embeds: [],
            components: []
        });
    },

    async handleModalSubmit(interaction) {
        const userId = interaction.user.id;
        const pending = pendingAnnounce.get(userId);

        if (!pending) {
            return interaction.reply({ 
                content: '⏰ Đã hết hạn. Dùng lại lệnh `.tb`!', 
                flags: [MessageFlags.Ephemeral] 
            });
        }

        try {
            const titleRaw   = interaction.fields.getTextInputValue('tb_title').trim();
            const content    = interaction.fields.getTextInputValue('tb_content').trim();
            const colorRaw   = interaction.fields.getTextInputValue('tb_color').trim();
            const footerRaw  = interaction.fields.getTextInputValue('tb_footer').trim();
            const pingRaw    = interaction.fields.getTextInputValue('tb_ping').trim().toLowerCase();

            // Parse màu
            let color = 0x5865F2; // Discord Blurple mặc định
            if (colorRaw) {
                const hex = colorRaw.replace('#', '');
                const parsed = parseInt(hex, 16);
                if (!isNaN(parsed) && hex.length === 6) {
                    color = parsed;
                }
            }

            // Build embed
            const embed = new EmbedBuilder().setColor(color);

            if (titleRaw) embed.setTitle(titleRaw);

            embed.setDescription(content);

            if (footerRaw) {
                embed.setFooter({ text: footerRaw });
            }

            embed.setTimestamp();

            // Fetch target channel
            const targetChannel = await interaction.client.channels.fetch(pending.channelId).catch(() => null);
            if (!targetChannel) {
                pendingAnnounce.delete(userId);
                return interaction.reply({ 
                    content: '❌ Không tìm thấy channel đích. Thử lại!', 
                    flags: [MessageFlags.Ephemeral] 
                });
            }

            // Xử lý ping
            let pingContent = '';
            if (pingRaw === '@everyone' || pingRaw === 'everyone') {
                pingContent = '@everyone';
            } else if (pingRaw === '@here' || pingRaw === 'here') {
                pingContent = '@here';
            }

            // Gửi thông báo
            await targetChannel.send({
                content: pingContent || undefined,
                embeds: [embed]
            });

            pendingAnnounce.delete(userId);

            // Preview cho admin
            const previewEmbed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('✅ Đã gửi thông báo!')
                .addFields(
                    { name: '📍 Channel', value: `<#${pending.channelId}>`, inline: true },
                    { name: '🔔 Ping', value: pingContent || 'Không', inline: true },
                    { name: '📝 Tiêu đề', value: titleRaw || '*(không có)*', inline: false },
                    { name: '📄 Nội dung', value: content.length > 200 ? content.slice(0, 200) + '...' : content, inline: false }
                )
                .setTimestamp();

            await interaction.reply({ 
                embeds: [previewEmbed], 
                flags: [MessageFlags.Ephemeral] 
            });

            Logger.warn(`📢 Announce sent to #${pending.channelName} by ${interaction.user.tag}`);

        } catch (error) {
            Logger.error('tb modal submit error:', error);
            pendingAnnounce.delete(userId);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ 
                    content: '❌ Lỗi gửi thông báo. Thử lại!', 
                    flags: [MessageFlags.Ephemeral] 
                }).catch(() => {});
            }
        }
    }
};
