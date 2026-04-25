const { EmbedBuilder } = require('discord.js');
const Config = require('../utils/config');

module.exports = {
    name: 'help',
    description: 'Danh sách lệnh',
    cooldown: 5,

    async execute(message, args) {
        const isAdmin = Config.isOwner(message.author.id);

        const embed = new EmbedBuilder()
            .setColor(0x7289DA)
            .setTitle(`📖 ${Config.BOT_NAME} - Danh sách lệnh`)
            .setDescription(`Prefix: \`${Config.PREFIX}\``)
            .addFields(
                {
                    name: '🔐 Tài khoản',
                    value: `\`${Config.PREFIX}signup\` - Đăng ký (DM)\n\`${Config.PREFIX}login\` - Đăng nhập (DM)\n\`${Config.PREFIX}logout\` - Đăng xuất\n\`${Config.PREFIX}profile\` - Thông tin cá nhân`
                },
                {
                    name: '🤖 AI',
                    value: `\`${Config.PREFIX}ask\` - Chat AI\n\`${Config.PREFIX}search\` - Tìm kiếm\n\`${Config.PREFIX}model\` - Chuyển model`
                },
                {
                    name: '💬 Chat',
                    value: `\`${Config.PREFIX}privatechat\` - Chat riêng\n\`${Config.PREFIX}endprv\` - Đóng chat riêng\n\`${Config.PREFIX}clear\` - Xóa lịch sử`
                },
                {
                    name: '⚙️ Khác',
                    value: `\`${Config.PREFIX}ping\` - Tốc độ\n\`${Config.PREFIX}intro\` - Giới thiệu\n\`${Config.PREFIX}feedbacks\` - Phản hồi\n\`${Config.PREFIX}appeal\` - Kháng cáo`
                }
            )
            .setTimestamp();

        if (isAdmin) {
            embed.addFields({
                name: '👑 Admin',
                value: `\`${Config.PREFIX}setban\` - Ban user\n\`${Config.PREFIX}unban\` - Gỡ ban`
            });
        }

        await message.reply({ embeds: [embed] });
    }
};
