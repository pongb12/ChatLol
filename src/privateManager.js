const { ChannelType } = require('discord.js');
const Config = require('./utils/config');
const Logger = require('./utils/logger');

class PrivateChatManager {
    constructor() {
        this.chats = new Map(); // userId -> { channelId, timer, lastActivity }
        this.cleanupInterval = null;
    }

    startCleanup(client) {
        if (this.cleanupInterval) return;

        Logger.info('🔄 Private Chat cleanup started');

        this.cleanupInterval = setInterval(() => {
            const now = Date.now();
            for (const [userId, data] of this.chats.entries()) {
                if (now - data.lastActivity > Config.PRIVATE_CHAT_TIMEOUT) {
                    Logger.info(`⏳ Private chat expired: ${userId.slice(0,6)}`);
                    this.endChat(client, userId, 'Timeout');
                }
            }
        }, 60000); // Check every minute
    }

    stopCleanup() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }

    async createChat(user) {
        try {
            // Check if already has active chat
            if (this.chats.has(user.id)) {
                const existing = this.chats.get(user.id);
                try {
                    const channel = await user.client.channels.fetch(existing.channelId);
                    if (channel) return channel;
                } catch {
                    // Channel deleted, remove from map
                }
                this.chats.delete(user.id);
            }

            // Create DM channel
            const dmChannel = await user.createDM();

            const data = {
                channelId: dmChannel.id,
                userId: user.id,
                createdAt: Date.now(),
                lastActivity: Date.now()
            };

            this.chats.set(user.id, data);

            await dmChannel.send({
                content: `👋 **Xin chào ${user}!**\n\nĐây là không gian riêng tư với Lol.AI.\n🤖 Bạn có thể chat thoải mái ở đây.\n⏳ Kênh sẽ tự động đóng sau **1 giờ** không hoạt động.\n🚫 Gõ \`${Config.PREFIX}endprv\` để đóng ngay.\n\n💡 Lưu ý: Chat riêng tư **không được lưu** và không tính vào quota.`
            });

            Logger.success(`Created private DM for ${user.tag}`);
            return dmChannel;

        } catch (error) {
            Logger.error('Error creating private chat:', error);
            throw error;
        }
    }

    getChat(userId) {
        return this.chats.get(userId) || null;
    }

    updateActivity(userId) {
        const data = this.chats.get(userId);
        if (data) {
            data.lastActivity = Date.now();
            return true;
        }
        return false;
    }

    async endChat(client, userId, reason = 'User request') {
        const data = this.chats.get(userId);
        if (!data) return false;

        this.chats.delete(userId);

        try {
            const user = await client.users.fetch(userId);
            if (user) {
                await user.send(`🔒 **Private chat đã đóng**\nLý do: ${reason}\nGõ \`${Config.PREFIX}privatechat\` để mở lại.`).catch(() => {});
            }
            Logger.info(`Closed private chat: ${userId.slice(0,6)} | ${reason}`);
            return true;
        } catch (error) {
            Logger.error('Error ending private chat:', error);
            return false;
        }
    }

    isPrivateChannel(channelId) {
        for (const data of this.chats.values()) {
            if (data.channelId === channelId) return true;
        }
        return false;
    }

    getUserByChannel(channelId) {
        for (const [userId, data] of this.chats.entries()) {
            if (data.channelId === channelId) return userId;
        }
        return null;
    }
}

module.exports = PrivateChatManager;
