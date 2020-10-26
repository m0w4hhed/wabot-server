const {
    createBot, log, dbLogs,
    WA, PUBTYPE, PUBSUB, dbConfigs
} = require('./api.venom');
const fs = require('fs-extra');
const { getDatas, setDatas } = require('./api.firebase');

const resolvers = {
    Query: {
        stopServer() {
            const server = 'server';
            if (WA[server]) {
                WA[server].close();
                log(server, `Bot ${server} Stopped!`);
                return 'SERVER_STOPPED';
            } else { return 'SERVER_NOT_ACTIVE'; }
        },
        getState() {
            const sessions = Object.keys(WA);
            PUBSUB.publish(PUBTYPE.GET_STATE, { state: sessions });
            return sessions;
        },
        async getLogs() {
            const logs = dbLogs.get('logs').value();
            return logs;
        },
        clearLog() {
            return 'CLEAR';
        }
    },

    Mutation: {
        async startBot(_, args) {
            const { bot_name, redeploy } = args;
            if (WA[bot_name]) {
                await WA[bot_name].close();
                if (redeploy) {
                    if (await fs.pathExists(`./tokens/${bot_name}.data.json`)) {
                        fs.remove(`./tokens/${bot_name}.data.json`);
                    }
                }
            }
            log(bot_name, (redeploy ? 'Redeploy ' : 'Starting ') + bot_name);
            const result = await createBot(bot_name);
            if (result === 'STARTED') {
                PUBSUB.publish(PUBTYPE.GET_STATE, { state: Object.keys(WA) });
                return `BOT_${redeploy ? 'REDEPLOYED' : 'STARTED'}`;
            } else {
                return result.toString();
            }
        },
        async stopBot(_, args) {
            const { bot_name, delete_bot } = args;
            if (delete_bot) {
                try {
                    await setDatas([{
                        path: `config/server-config/bot-session/${bot_name}`,
                        delete: true
                    }]);
                    if (await fs.pathExists(`./tokens/${bot_name}.data.json`)) {
                        fs.remove(`./tokens/${bot_name}.data.json`);
                    }
                } catch (err) {
                    return 'ERROR';
                }
            }
            if (WA[bot_name]) {
                const message = delete_bot ? 'deleted' : 'stopped';
                try {
                    await WA[bot_name].close();
                    delete WA[bot_name];
                    PUBSUB.publish(PUBTYPE.GET_STATE, { state: Object.keys(WA) });
                    log(bot_name, `Bot ${bot_name} ${message}!`);
                    return `BOT_${message.toUpperCase()}`;
                } catch (err) { return 'ERROR'; }
            } else { return 'BOT_INACTIVE'; }
        },
        async sendText(_, args) {
            const { bot_name, to, text } = args;
            if (WA[bot_name]) {
                await WA[bot_name].sendText(to, text);
                log(bot_name, `Send text to ${to}`);
                return 'OK';
            } else {
                return 'BOT_INACTIVE';
            }
        },
        async getGroups(_, args) {
            const { bot_name } = args;
            if (WA[bot_name]) {
                const groups = (await WA[bot_name].getAllGroups()).map(g => ({
                    id: g.id._serialized,
                    name: g.name
                }));
                let adminGroup = [];
                const sessions = dbConfigs.get('sessions').value();
                const bot_number = sessions.find(s => s.id === bot_name).phone;
                groups.forEach(async (group) => {
                    const admins = await WA[bot_name].getGroupAdmins(group.id);
                    const adminIds = admins.map(a => a._serialized);
                    const isAdmin = adminIds.includes(bot_number);
                    console.log(group.name, isAdmin);
                    // console.log(admins)
                });
                return 'OK';
            } else {
                return 'BOT_INACTIVE';
            }
        }
    },

    Subscription: {
        log: { subscribe(_, __) { return PUBSUB.asyncIterator(PUBTYPE.LOG); } },
        qr: { subscribe(_, __) { return PUBSUB.asyncIterator(PUBTYPE.SEND_QR); } },
        state: { subscribe(_, __) { return PUBSUB.asyncIterator(PUBTYPE.GET_STATE); } }
    },
};

module.exports = resolvers;