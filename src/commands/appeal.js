const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const Config = require('../utils/config');
const Logger = require('../utils/logger');
const Firebase = require('../utils/firebase');

module.exports = {
    name: 'appeal',
    description: 'Kháng cáo khi bị chặn',
    cooldown: 300,

    async execute(message, args) {
        const userId = message.author.id;

        try {
            const isBanned = await Firebase.isBanned(userId);
            if (!isBanned) {
                return message.reply('ℹ️ Bạn không bị chặn.');
            }

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`appeal_open_${userId}`)
                    .setLabel('📝 Mở form kháng cáo')
                    .setStyle(ButtonStyle.Primary)
            );

            const embed = new EmbedBuilder()
                .setColor(0xFFA500)
                .setTitle('📢 Kháng cáo')
                .setDescription('Nhấn nút bên dưới để mở **form kháng cáo**.\n\n⚠️ Bạn cần điền đầy đủ:\n- Tên đơn kháng cáo\n- Nội dung lý do\n- Link bằng chứng (ảnh/video)')
                .setFooter({ text: 'Form sẽ hết hạn sau 5 phút' })
                .setTimestamp();

            await message.reply({ embeds: [embed], components: [row] });

        } catch (error) {
            Logger.error('Appeal error:', error);
            message.reply('❌ Lỗi. Thử lại!');
        }
    },

    async handleOpenButton(interaction) {
        const userId = interaction.user.id;

        const modal = new ModalBuilder()
            .setCustomId(`appeal_modal_${userId}_${Date.now()}`)
            .setTitle('📢 Đơn Kháng Cáo');

        const nameInput = new TextInputBuilder()
            .setCustomId('appeal_name')
            .setLabel('Tên đơn kháng cáo')
            .setPlaceholder('Ví dụ: Kháng cáo ban oan ngày 26/4/2026')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(100);

        const contentInput = new TextInputBuilder()
            .setCustomId('appeal_content')
            .setLabel('Nội dung kháng cáo')
            .setPlaceholder('Giải thích chi tiết lý do bạn bị ban oan...')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMinLength(20)
            .setMaxLength(1000);

        const evidenceInput = new TextInputBuilder()
            .setCustomId('appeal_evidence')
            .setLabel('Link bằng chứng (ảnh/video đoạn chat)')
            .setPlaceholder('https://imgur.com/... hoặc https://youtu.be/...')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(500);

        modal.addComponents(
            new ActionRowBuilder().addComponents(nameInput),
            new ActionRowBuilder().addComponents(contentInput),
            new ActionRowBuilder().addComponents(evidenceInput)
        );

        await interaction.showModal(modal);
    },

    async handleModalSubmit(interaction) {
        const userId = interaction.user.id;

        // Xử lý modal lý do từ chối (từ admin)
        if (interaction.customId.startsWith('appeal_deny_reason_')) {
            const targetUserId = interaction.customId.replace('appeal_deny_reason_', '').split('_')[0];
            const denyReason = interaction.fields.getTextInputValue('deny_reason');

            try {
                // Disable buttons trên tin nhắn gốc
                const disabledRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('done')
                        .setLabel('❌ Đã từ chối')
                        .setStyle(ButtonStyle.Danger)
                        .setDisabled(true)
                );
                await interaction.update({ components: [disabledRow] });

                // Thông báo cho user kèm lý do
                const targetUser = await interaction.client.users.fetch(targetUserId).catch(() => null);
                if (targetUser) {
                    const embed = new EmbedBuilder()
                        .setColor(0xFF0000)
                        .setTitle('❌ Kháng cáo bị từ chối')
                        .setDescription('Đơn kháng cáo của bạn đã bị **từ chối**.')
                        .addFields({ name: '📝 Lý do từ admin', value: denyReason })
                        .setFooter({ text: 'Nếu có thêm bằng chứng, gõ .appeal để gửi lại' })
                        .setTimestamp();

                    await targetUser.send({ embeds: [embed] }).catch(() => {});
                }

                Logger.warn(`Appeal denied with reason: ${targetUserId} by ${interaction.user.tag} | ${denyReason}`);
            } catch (error) {
                Logger.error('Appeal deny reason error:', error);
            }
            return;
        }

        // Xử lý modal kháng cáo từ user
        try {
            const isBanned = await Firebase.isBanned(userId);
            if (!isBanned) {
                return interaction.reply({ content: 'ℹ️ Bạn không bị chặn.', ephemeral: true });
            }

            const appealName = interaction.fields.getTextInputValue('appeal_name');
            const content = interaction.fields.getTextInputValue('appeal_content');
            const evidence = interaction.fields.getTextInputValue('appeal_evidence');

            const owner = await interaction.client.users.fetch(Config.OWNER_ID).catch(() => null);

            if (owner) {
                const embed = new EmbedBuilder()
                    .setColor(0xFFA500)
                    .setTitle('📢 ĐƠN KHÁNG CÁO MỚI')
                    .addFields(
                        { name: '👤 User', value: `${interaction.user.tag} (${userId})` },
                        { name: '📌 Tên đơn', value: appealName },
                        { name: '📝 Nội dung', value: content },
                        { name: '🔗 Bằng chứng', value: evidence },
                        { name: '🕒 Thời gian', value: new Date().toLocaleString('vi-VN') }
                    )
                    .setTimestamp();

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`approve_appeal_${userId}`)
                        .setLabel('✅ Chấp nhận')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`deny_appeal_${userId}`)
                        .setLabel('❌ Từ chối')
                        .setStyle(ButtonStyle.Danger)
                );

                await owner.send({ embeds: [embed], components: [row] });
            }

            await interaction.reply({
                content: '✅ Đã gửi đơn kháng cáo! Chờ admin xử lý.',
                ephemeral: true
            });

            Logger.warn(`Appeal submitted: ${interaction.user.tag}`);

        } catch (error) {
            Logger.error('Appeal modal submit error:', error);
            await interaction.reply({ content: '❌ Lỗi gửi đơn. Thử lại!', ephemeral: true }).catch(() => {});
        }
    },

    async handleApprove(interaction, targetUserId) {
        try {
            await Firebase.unbanUser(targetUserId);

            const disabledRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('done')
                    .setLabel('✅ Đã chấp nhận')
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(true)
            );

            await interaction.update({ components: [disabledRow] });

            const targetUser = await interaction.client.users.fetch(targetUserId).catch(() => null);
            if (targetUser) {
                const embed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle('✅ Kháng cáo được chấp nhận')
                    .setDescription('Đơn kháng cáo của bạn đã được **chấp nhận**!\nBạn có thể sử dụng bot bình thường.')
                    .setTimestamp();

                await targetUser.send({ embeds: [embed] }).catch(() => {});
            }

            Logger.warn(`Appeal approved: ${targetUserId} by ${interaction.user.tag}`);

        } catch (error) {
            Logger.error('Appeal approve error:', error);
            await interaction.reply({ content: '❌ Lỗi xử lý.', ephemeral: true }).catch(() => {});
        }
    },

    async handleDeny(interaction, targetUserId) {
        try {
            // Mở modal nhập lý do — có thể bỏ qua bằng cách đóng modal
            const modal = new ModalBuilder()
                .setCustomId(`appeal_deny_reason_${targetUserId}_${Date.now()}`)
                .setTitle('❌ Lý do từ chối');

            const reasonInput = new TextInputBuilder()
                .setCustomId('deny_reason')
                .setLabel('Lý do từ chối (có thể bỏ qua bằng cách nhập "-")')
                .setPlaceholder('Ví dụ: Bằng chứng không hợp lệ, vi phạm rõ ràng...')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(500);

            modal.addComponents(
                new ActionRowBuilder().addComponents(reasonInput)
            );

            await interaction.showModal(modal);

        } catch (error) {
            Logger.error('Appeal deny error:', error);
            await interaction.reply({ content: '❌ Lỗi xử lý.', ephemeral: true }).catch(() => {});
        }
    }
};
