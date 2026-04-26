const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const Config = require('../utils/config');
const Logger = require('../utils/logger');

module.exports = {
    name: 'feedbacks',
    description: 'Gửi phản hồi',
    cooldown: 60,

    async execute(message, args) {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`feedback_open_${message.author.id}`)
                .setLabel('📝 Mở form phản hồi')
                .setStyle(ButtonStyle.Primary)
        );

        const embed = new EmbedBuilder()
            .setColor(0x7289DA)
            .setTitle('📢 Gửi phản hồi')
            .setDescription('Nhấn nút để mở **form phản hồi**.\n\nBạn có thể gửi:\n- Đề xuất tính năng mới\n- Báo cáo lỗi\n- Góp ý cải thiện bot')
            .setFooter({ text: 'Form sẽ hết hạn sau 5 phút' })
            .setTimestamp();

        await message.reply({ embeds: [embed], components: [row] });
    },

    async handleOpenButton(interaction) {
        const modal = new ModalBuilder()
            .setCustomId(`feedback_modal_${interaction.user.id}_${Date.now()}`)
            .setTitle('📢 Form Phản Hồi');

        const typeInput = new TextInputBuilder()
            .setCustomId('feedback_type')
            .setLabel('Loại phản hồi')
            .setPlaceholder('Ví dụ: Báo lỗi / Đề xuất / Góp ý')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(50);

        const titleInput = new TextInputBuilder()
            .setCustomId('feedback_title')
            .setLabel('Tiêu đề')
            .setPlaceholder('Tóm tắt ngắn gọn vấn đề/đề xuất của bạn')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(100);

        const contentInput = new TextInputBuilder()
            .setCustomId('feedback_content')
            .setLabel('Nội dung chi tiết')
            .setPlaceholder('Mô tả chi tiết...')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMinLength(10)
            .setMaxLength(1000);

        modal.addComponents(
            new ActionRowBuilder().addComponents(typeInput),
            new ActionRowBuilder().addComponents(titleInput),
            new ActionRowBuilder().addComponents(contentInput)
        );

        await interaction.showModal(modal);
    },

    async handleModalSubmit(interaction) {
        // Xử lý modal phản hồi từ admin
        if (interaction.customId.startsWith('feedback_reply_')) {
            const targetUserId = interaction.customId.replace('feedback_reply_', '').split('_')[0];
            const replyContent = interaction.fields.getTextInputValue('reply_content');

            try {
                // Disable nút reply sau khi gửi
                const disabledRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('done')
                        .setLabel('✅ Đã phản hồi')
                        .setStyle(ButtonStyle.Success)
                        .setDisabled(true)
                );
                await interaction.update({ components: [disabledRow] });

                // Gửi phản hồi tới user
                const targetUser = await interaction.client.users.fetch(targetUserId).catch(() => null);
                if (targetUser) {
                    const embed = new EmbedBuilder()
                        .setColor(0x00FF00)
                        .setTitle('💬 Phản hồi từ Admin')
                        .setDescription('Admin đã phản hồi feedback của bạn!')
                        .addFields({ name: '📝 Nội dung', value: replyContent })
                        .setFooter({ text: 'Cảm ơn bạn đã góp ý cho Lol.AI!' })
                        .setTimestamp();

                    await targetUser.send({ embeds: [embed] }).catch(() => {});
                }

                Logger.info(`Feedback replied to ${targetUserId} by ${interaction.user.tag}`);
            } catch (error) {
                Logger.error('Feedback reply error:', error);
            }
            return;
        }

        // Xử lý modal feedback từ user
        try {
            const type = interaction.fields.getTextInputValue('feedback_type');
            const title = interaction.fields.getTextInputValue('feedback_title');
            const content = interaction.fields.getTextInputValue('feedback_content');
            const userId = interaction.user.id;

            const owner = await interaction.client.users.fetch(Config.OWNER_ID).catch(() => null);
            if (owner) {
                const embed = new EmbedBuilder()
                    .setColor(0x7289DA)
                    .setTitle('📢 Phản hồi mới')
                    .addFields(
                        { name: '👤 User', value: `${interaction.user.tag} (${userId})` },
                        { name: '🏷️ Loại', value: type },
                        { name: '📌 Tiêu đề', value: title },
                        { name: '📝 Nội dung', value: content }
                    )
                    .setTimestamp();

                // Nút phản hồi lại cho admin
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`feedback_reply_btn_${userId}`)
                        .setLabel('💬 Phản hồi lại user')
                        .setStyle(ButtonStyle.Primary)
                );

                await owner.send({ embeds: [embed], components: [row] }).catch(() => {});
            }

            await interaction.reply({ content: '✅ Đã gửi phản hồi! Cảm ơn bạn.', ephemeral: true });
            Logger.info(`Feedback from ${interaction.user.tag}: [${type}] ${title}`);

        } catch (error) {
            Logger.error('Feedback modal submit error:', error);
            await interaction.reply({ content: '❌ Lỗi gửi phản hồi.', ephemeral: true }).catch(() => {});
        }
    },

    // Admin nhấn nút phản hồi lại
    async handleReplyButton(interaction, targetUserId) {
        try {
            const modal = new ModalBuilder()
                .setCustomId(`feedback_reply_${targetUserId}_${Date.now()}`)
                .setTitle('💬 Phản hồi tới User');

            const replyInput = new TextInputBuilder()
                .setCustomId('reply_content')
                .setLabel('Nội dung phản hồi')
                .setPlaceholder('Nhập nội dung muốn gửi tới user...')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMinLength(5)
                .setMaxLength(1000);

            modal.addComponents(
                new ActionRowBuilder().addComponents(replyInput)
            );

            await interaction.showModal(modal);

        } catch (error) {
            Logger.error('Feedback reply button error:', error);
            await interaction.reply({ content: '❌ Lỗi. Thử lại!', ephemeral: true }).catch(() => {});
        }
    }
};
