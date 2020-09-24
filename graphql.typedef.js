const typeDefs = `
type Query {
    stopServer: String!,
    getState: [String!]!,
    getLogs: [Log!]!,
    clearLog: String!,
}
type Log {
    from: String!,
    time: Int!,
    desc: String!,
}
type Group {
    id: String!,
    name: String!,
}
type Mutation{
    startBot(
        bot_name: String!,
        redeploy: Boolean
    ): String!,
    stopBot(
        bot_name: String!,
        delete_bot: Boolean
    ): String!,
    sendText(
        bot_name: String!,
        to: String!,
        text: String!,
    ): String!,
    getGroups(
        bot_name: String!,
    ): String!
}
type Subscription {
    log: Log!,
    qr: String!,
    state: [String!]!
}
`;

module.exports = typeDefs;