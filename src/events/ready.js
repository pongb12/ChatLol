const Config = require('../utils/config');
const Logger = require('../utils/logger');

module.exports = {
    name: 'ready',
    once: true,
    execute(client) {
        Logger.success(`✅ ${Config.BOT_NAME} v${Config.BOT_VERSION} ready!`);
        Logger.success(`Tag: ${client.user.tag}`);
        Logger.success(`ID: ${client.user.id}`);
        Logger.success(`Servers: ${client.guilds.cache.size}`);
        Logger.success(`Prefix: "${Config.PREFIX}"`);

        const activities = [
            `${Config.PREFIX}help`,
            `${Config.PREFIX}ask`,
            'Lol.AI v2',
            'Powered by Groq'
        ];

        let i = 0;
        setInterval(() => {
            client.user.setActivity({
                name: activities[i++ % activities.length],
                type: 0
            });
        }, 15000);

        Logger.info(`📎 Invite: https://discord.com/oauth2/authorize?client_id=${client.user.id}&scope=bot&permissions=277025508352`);
    }
};
