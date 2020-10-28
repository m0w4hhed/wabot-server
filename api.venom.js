const venom = require('venom-bot');
const { PubSub } = require('graphql-yoga');
const PUBSUB = new PubSub();
const fs = require('fs-extra');

const { getDatas, setDatas, getData } = require('./api.firebase');

const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const dbLogs = low(new FileSync('./db.logs.json'));
const dbConfigs = low(new FileSync('./db.config.json'));
dbLogs.defaults({ logs: [] }).write();
dbConfigs.defaults({
    sessions: [], admins: [], groups: [], perentGroups: [],
    commands: [], timeout: 60000, bruteMode: false
}).write();

getDatas('config/server-config/bot-admin').subscribe(
    (res) => {
        dbConfigs.get('admins').remove().write();
        dbConfigs.get('admins').push(...res).write();
    },
    (err) => console.log(err)
);
getDatas('config/server-config/bot-session').subscribe(
    (res) => {
        dbConfigs.get('sessions').remove().write();
        dbConfigs.get('sessions').push(...res).write();
    },
    (err) => console.log(err)
);
getDatas('config/server-config/bot-group').subscribe(
    (res) => {
        dbConfigs.get('groups').remove().write();
        dbConfigs.get('groups').push(...res).write();
    },
    (err) => console.log(err)
);
getDatas('config/server-config/bot-group-pusat').subscribe(
    (res) => {
        dbConfigs.get('perentGroups').remove().write();
        dbConfigs.get('perentGroups').push(...res).write();
    },
    (err) => console.log(err)
);
getData('config/server-config').subscribe(
    (res) => {
        // console.log(res.data());
        const { commands, timeout, bruteMode } = res.data();
        dbConfigs.get('commands').remove().write();
        dbConfigs.get('commands').push(...commands).write();
        dbConfigs.set('timeout', timeout).write();
        dbConfigs.set('bruteMode', bruteMode).write();
    },
    (err) => console.log(err)
);

const BRUTE_MODE = dbConfigs.get('bruteMode').value();
const TIMEOUT = dbConfigs.get('timeout').value();
const RESTRICTED_NAME = ['node_modules', 'server'];
const PUBTYPE = {
    SEND_QR: 'SEND_QR',
    LOG: 'LOG',
    GET_STATE: 'GET_STATE',
};
const COMMANDS = dbConfigs.get('commands').value();
const GROUPS = dbConfigs.get('groups').value();
const PERENT_GROUPS = dbConfigs.get('perentGroups').value();

var WA = {};
const log = async (from, desc) => {
    const time = Math.floor(Date.now() / 1000);
    from = from.toLowerCase();
    const log = {from, time, desc};
    await dbLogs.get('logs').push(log).write();
    PUBSUB.publish(PUBTYPE.LOG, {log: log});
    console.log('\x1b[32m' + from + '\x1b[0m', time, desc);
};
const messageHandler = async (botName, botMessage) => {
    // console.log(botMessage);
    const { type, body, from, to, t, sender, isGroupMsg, chat } = botMessage;
    const { id, pushname } = sender;
    const { contact } = chat;
    const { name } = contact;
    
    const sessionData = dbConfigs.get('sessions').value().find(s => s.id===botName);
    if (!sessionData.phone || sessionData.phone!==to) {
        setDatas([{
            path: `config/server-config/bot-session/${botName}`,
            partialData: {phone: to}
        }]);
    }

    const senderID = id;
    const admins = dbConfigs.get('admins').value();
    const isAdmin = admins.map(a => a.id).includes(id);
    const activeCmds = COMMANDS.filter(c => c.active);
    const allowedCmds = isAdmin ? activeCmds : activeCmds.filter(c => c.public);
    const cmds = allowedCmds.map(x => x.cmd + '\\b').join('|');
    let cmd = body ? body.match(new RegExp(cmds, 'gi')) : null;
    // console.log(!!cmd, null);
    if (!!cmd) {
        log(botName, `[EXEC] ${cmd[0]} from ${pushname}`);
        const args = body ? body.trim().split(' ') : null;
        switch (cmd[0]) {
            case '#getId':
                WA[botName].sendText(from, from);
                // console.log(botMessage);
            break;
            case '#setGroup':
                if (isGroupMsg && args.length===2) {
                    const group = args[1].toUpperCase();
                    const data = { group, name, id: from };
                    setDatas([{
                        path: `config/server-config/bot-group/${from}`,
                        partialData: data
                    }]).then(
                        () => WA[botName].sendText(id, `*${name}* sekarang di kelompok *group ${group}*!`),
                        (err) => WA[botName].sendText(id, err.toString())
                    );
                } else {
                    WA[botName].sendText(from, 'Contoh perintah:\n*#setGroup A*');
                }
            break;
            case '#setPusat':
                if (isGroupMsg && args.length===2) {
                    const group = args[1].toUpperCase();
                    const data = { group, name, id: from };
                    setDatas([{
                        path: `config/server-config/bot-group-pusat/${from}`,
                        partialData: data
                    }]).then(
                        () => WA[botName].sendText(id, `*${name}* sekarang menjadi pusat *group ${group}*!`),
                        (err) => WA[botName].sendText(id, err.toString())
                    );
                } else {
                    WA[botName].sendText(id, 'Contoh perintah:\n*#setPusat A*');
                }
            break;
            // case '#stopServer':
            //     await WA[botName].sendText(from, 'Bot dimatikan!\nAktifkan kembali bot dengan aplikasi client.');
            //     log(botName, `Bot ${botName} Stopped!`);
            //     WA[botName].close();
            // break;
            case '#getBots':
                const sessions = Object.keys(WA);
                WA[botName].sendText(from, 'Sesi Aktif:\n\n' +
                    sessions.map((s, i) => (`${i+1}. *${s}*`)).join('\n')
                );
            break;
            case '#startBot':
                if (!isGroupMsg && args.length===2) {
                    const id = args[1];
                    if (RESTRICTED_NAME.includes(id)) {
                        WA[botName].sendText(from, `Nama bot *${id}* dilarang!`);
                    } else {
                        if (!WA[id]) {
                            createBot(id, from);
                        } else {
                            WA[botName].sendText(from, `Bot *${id}* sudah aktif!`);
                        }
                    }
                } else {
                    WA[botName].sendText(from, 'Contoh perintah:\n*#startBot hp-update*');
                }
            break;
            case '#addAdmin':
                if (!isGroupMsg && args.length===2) {
                    const GROUPS = dbConfigs.get('groups').value();
                    const serverData = dbConfigs.get('sessions').value().find(s => s.id==='server');
                    const group = args[1];
                    if (botName!=='server') {
                        const CHILD_GROUPS = GROUPS.filter(g => g.group === group);
                        const PERENT_GROUP = PERENT_GROUPS.find(p => p.group === group);
                        if (CHILD_GROUPS.length) {
                            let isInServerContact = true;
                            [PERENT_GROUP, ...CHILD_GROUPS].forEach(async (g, i) => {
                                try {
                                    let groupAdmins = await WA.server.getGroupAdmins(g.id);
                                    groupAdmins = groupAdmins.map(a => a._serialized);
                                    // console.log(g.name, groupAdmins);
                                    if (groupAdmins.includes(serverData.phone)) {
                                        WA.server.promoteParticipant(g.id, to).then(
                                            () => WA[botName].sendText(from, `*${botName}* berhasil dijadikan admin di group ${g.name}`),
                                            (err) => isInServerContact = false
                                        );
                                    } else {
                                        WA[botName].sendText(from, `*server* belum menjadi admin di group *${g.name}*`);
                                    }
                                } catch (err) {
                                    console.log('ERROR', err);
                                }
                            });
                            if (!isInServerContact) {
                                WA[botName].sendText(from, `Gagal menjadikan admin group, harap memasukkan nomor ini di kontak server!`);
                            }
                        } else {
                            WA[botName].sendText(from, `Kelompok group *${group}* tidak ditemukan!`);
                        }
                    } else {
                        WA[botName].sendText(from, 'Hanya *selain server* yg dapat dijadikan admin group');
                    }
                } else {
                    WA[botName].sendText(from, 'Contoh perintah:\n*#addAdmin <nama kelompok group>*\n*#addAdmin A*');
                }
            break;
            case '#addToGroup':
                if (!isGroupMsg && args.length===2) {
                    const GROUPS = dbConfigs.get('groups').value();
                    const serverData = dbConfigs.get('sessions').value().find(s => s.id==='server');
                    const group = args[1];
                    if (botName!=='server') {
                        const CHILD_GROUPS = GROUPS.filter(g => g.group === group);
                        const PERENT_GROUP = PERENT_GROUPS.find(p => p.group === group);
                        if (CHILD_GROUPS.length) {
                            let isInServerContact = true;
                            [PERENT_GROUP, ...CHILD_GROUPS].forEach(async (g, i) => {
                                try {
                                    let groupAdmins = await WA.server.getGroupAdmins(g.id);
                                    groupAdmins = groupAdmins.map(a => a._serialized);
                                    // console.log(g.name, groupAdmins);
                                    if (groupAdmins.includes(serverData.phone)) {
                                        WA.server.addParticipant(g.id, to).then(
                                            () => WA[botName].sendText(from, `*${botName}* berhasil dimasukkan ke group ${g.name}`),
                                            (err) => isInServerContact = false
                                        );
                                    } else {
                                        WA[botName].sendText(from, `*server* belum menjadi admin di group *${g.name}*`);
                                    }
                                } catch (err) {
                                    console.log('ERROR', err);
                                }
                            });
                            if (!isInServerContact) {
                                WA[botName].sendText(from, `Gagal memasukkan nomor ini ke group, harap memasukkan nomor ini di kontak server!`);
                            }
                        } else {
                            WA[botName].sendText(from, `Kelompok group *${group}* tidak ditemukan!`);
                        }
                    } else {
                        WA[botName].sendText(from, 'Hanya *selain server* yg dapat dimasukkan group');
                    }
                } else {
                    WA[botName].sendText(from, 'Contoh perintah:\n*#addToGroup <nama kelompok group>*\n*#addToGroup A*');
                }
            break;
            case '#help':
                const helpText = activeCmds.map(c => (`*${c.cmd}*:\n${c.info}`));
                WA[botName].sendText(id, `Perintah yg didukung:\n\n${helpText.join('\n')}`);
            break;
            case '#getMod':
                const admins = dbConfigs.get('admins').value();
                const adminList = admins.map((a, i) => (`${i+1}. *${a.name}*\n${a.id}`)).join('\n');
                WA[botName].sendText(from, 'Moderator yg terdaftar:\n\n' + adminList.trim());
            break;
            case '#addMod':
                if (!isGroupMsg && args.length===3) {
                    const hp = args[1].replace(/[^0-9]/gi, '');
                    if (hp) {
                        const id = hp + '@c.us';
                        const name = args[2] || `mod-${admins.length+1}`;
                        setDatas([{
                            path: `config/server-config/bot-admin/${id}`,
                            partialData: {id, name}
                        }]).then(
                            () => WA[botName].sendText(from, `${hp} sekarang moderator!`),
                            (err) => WA[botName].sendText(from, err.toString())
                        );
                    } else {
                        WA[botName].sendText(from, 'Nomor tidak valid!');
                    }
                } else {
                    WA[botName].sendText(from, 'contoh:\n*#addMod 628111222333 mod-pusat*');
                }
            break;
            case '#restartServer':
                if (!isGroupMsg && args.length===2) {
                    // if (args[1] === 'yes') restartServer(server, from);
                } else {
                    WA[botName].sendText(from, '*#restartServer yes* untuk merestart server.\n(!) SEMUA CLIENT JUGA AKAN DIRESET (!)');
                }
            break;
        }
    } else {
        const ty = isGroupMsg ? 'Group' : 'Private';
        if (!isGroupMsg) log(botName, `[RECV] ${ty} Message from ${from}`);
        
        const perentGroup = PERENT_GROUPS.find(perent => perent.id === from);
        const isServer = botName === 'server';
        if (isAdmin && !isServer && perentGroup) {
            log(botName, `[RECV] ${ty} Message in ${perentGroup.name}`);
            const CHILD_GROUPS = GROUPS.filter(g => g.group === perentGroup.group);
            CHILD_GROUPS.forEach(child => {
                WA[botName].forwardMessages(child.id, [botMessage.id], true)
                .then(() => log(botName, `[SEND] Message to ${child.name}`))
                .catch((err) =>  WA.server.sendText(senderID, `Gagal kirim pesan ke group *${child.name}*\n\n1. Pastikan *${botName}* sudah berada di group\n2. Pastikan *${botName}* sudah menjadi admin group`));
            });
        }
    }
};
function sendQR(base64Qr, to, botName) {
    try {
        base64Qr = base64Qr.replace('data:image/png;base64,', '');
        const imageBuffer = Buffer.from(base64Qr, 'base64');
        fs.writeFileSync('./qr.png', imageBuffer);
        WA.server.sendImage(to, './qr.png', 'qr.png', `Scan untuk ${botName}`);
    } catch(err) {
        console.log('ERROR SEND:', err);
    }
}

const createBot = (botName, from) => {
    if (botName==='server') {
        dbLogs.get('logs').remove().write();
        respawnBots(BRUTE_MODE);
    }
    log(botName, `Starting ${botName}`);
    log(botName, `[CONFIG] BruteMode: ${BRUTE_MODE}`);
    log(botName, `[CONFIG] Timeout: ${TIMEOUT}`);
    return new Promise(async (resolve, reject) => {
        try {
            var qrTmp, authenticated = false;
            if (from) WA.server.sendText(from, `Sedang menginisiasi whatsapp bot *${botName}*\n\n_Segera scan jika diperlukan login ulang dengan Whatsapp Web_\n*_(Batas waktu 60 detik)_*`);
            log(botName, `Authenticating ${botName}`);
            const bot = await venom.create(botName,
                (base64Qr) => {
                    if (from) {
                        if (qrTmp!==base64Qr) sendQR(base64Qr, from, botName);
                        qrTmp = (qrTmp !== base64Qr) ? base64Qr : qrTmp;
                    } else {
                        PUBSUB.publish(PUBTYPE.SEND_QR, {qr: base64Qr});
                    }
                },
                (logInStatus) => {
                    console.log('[STATUS]', botName + ': ' + logInStatus);
                    if (logInStatus==='browserClose') {
                        if (WA[botName]) delete WA[botName];
                        fs.pathExists(`./tokens/${botName}.data.json`).then(() => {
                            fs.remove(`./tokens/${botName}.data.json`);
                        });
                        PUBSUB.publish(PUBTYPE.SEND_QR, {qr: ''});
                        log(botName, `Whatsapp ${botName} not authenticated!`);
                        if (from) WA.server.sendText(from, `Batal menjalankan bot *${botName}*!`);
                        resolve('START_BOT_CANCELED');
                    }
                },
                {logQR: false, disableWelcome: true, autoClose: TIMEOUT /*, refreshQR: 30000 */}
            );
            if (bot) { // if authenticated
                authenticated = true;
                WA[botName] = bot;
                log(botName, 'Whatsapp Authenticated!');
                const sessions = Object.keys(WA);
                PUBSUB.publish(PUBTYPE.GET_STATE, { state: sessions });
                PUBSUB.publish(PUBTYPE.SEND_QR, {qr: ''});
                const time = Math.floor(Date.now() / 1000);
                setDatas([{
                    path: `config/server-config/bot-session/${botName}`,
                    partialData: {id: botName, lastLogin: time}
                }]);
                WA[botName].onMessage((serverMessage) => {
                    messageHandler(botName, serverMessage);
                });
                WA[botName].onStateChange((state) => {
                    log(botName, `Session: ${state}`);
                    const conflics = [
                        venom.SocketState.CONFLICT,
                        venom.SocketState.UNPAIRED,
                        venom.SocketState.UNLAUNCHED,
                    ];
                    if (conflics.includes(state)) {
                        WA[botName].useHere();
                    }
                });
                if (from) {
                    WA.server.sendText(from, `Bot *${botName}* berhasil dijalankan!`);
                }
                resolve('STARTED');
            }
        } catch (err) {
            log(botName, err.message);
            reject(err.message);
        }
    });
};
const respawnBots = (bruteMode) => {
    const sessions = dbConfigs.get('sessions').value();
    const admins = dbConfigs.get('admins').value();
    const adminContact = admins.find(a => a.name === 'admin');
    async function asyncForEach(array, callback) {
        for (let index = 0; index < array.length; index++) {
          await callback(array[index], index, array);
        }
    }
    const createAllBotsAsync = async () => {
        await asyncForEach(sessions, async (s) => {
            if (!WA[s.id]) {
                await createBot(s.id, adminContact.id);
            }
        });
    };
    const createAllBot = () => {
        sessions.forEach((s) => {
            if (!WA[s.id]) {
                createBot(s.id, adminContact.id);
            }
        });
    };
    if (!bruteMode) {
        return createAllBotsAsync();
    } else {
        return createAllBot();
    }
};

module.exports = {
    createBot, log, dbLogs,
    WA, PUBTYPE, PUBSUB, dbConfigs
};