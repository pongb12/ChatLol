const { EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const Config = require('../utils/config');
const Logger = require('../utils/logger');

module.exports = {
    name: 'feedbacks',
    description: 'Gửi phản hồi',
    cooldown: 60,

    async execute(message, args) {
        try {
            const modal = new ModalBuilder()
                .setCustomId(`feedback_modal_${message.author.id}_${Date.now()}`)
                .setTitle('📢 Gửi phản hồi');

            const titleInput = new TextInputBuilder()
                .setCustomId('feedback_title')
                .setLabel('Tiêu đề')
                .setPlaceholder('Ví dụ: Đề xuất tính năng')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(100);

            const contentInput = new TextInputBuilder()
                .setCustomId('feedback_content')
                .setLabel('Nội dung')
                .setPlaceholder('Mô tả chi tiết...')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMinLength(10)
                .setMaxLength(1000);

            modal.addComponents(
                new ActionRowBuilder().addComponents(titleInput),
                new ActionRowBuilder().addComponents(contentInput)
            );

            await message.showModal(modal);

        } catch (error) {
            Logger.error('Feedback error:', error);
            message.reply('❌ Không thể mở form. Thử lại!');
        }
    },

    async handleModalSubmit(interaction) {
        try {
            const title = interaction.fields.getTextInputValue('feedback_title');
            const content = interaction.fields.getTextInputValue('feedback_content');

            // Send to owner
            const owner = await interaction.client.users.fetch(Config.OWNER_ID).catch(() => null);
            if (owner) {
                const embed = new EmbedBuilder()
                    .setColor(0xFFA500)
                    .setTitle('📢 Phản hồi mới')
                    .addFields(
                        { name: '👤 User', value: `${interaction.user.tag} (${interaction.user.id})` },
                        { name: '📌 Tiêu đề', value: title },
                        { name: '📝 Nội dung', value: content }
                    )
                    .setTimestamp();

                await owner.send({ embeds: [embed] }).catch(() => {});
            }

            await interaction.reply({ content: '✅ Đã gửi phản hồi! Cảm ơn bạn.', ephemeral: true });
            Logger.info(`Feedback from ${interaction.user.tag}`);

        } catch (error) {
            Logger.error('Feedback submit error:', error);
            await interaction.reply({ content: '❌ Lỗi gửi phản hồi.', ephemeral: true }).catch(() => {});
        }
    }
};
