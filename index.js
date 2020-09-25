const { createBot } = require('./api.venom');
const { GraphQLServer } = require('graphql-yoga');
const typeDefs = require('./graphql.typedef');
const resolvers = require('./graphql.resolver');

const server  = new GraphQLServer({
    typeDefs, resolvers,
    // context: { pubsub }
});
const port = process.env.PORT || 3000;

server.start({port: port}, ({ port }) => {
    console.log(`Server started, listening on port ${port} for incoming requests.`);
    createBot('server');
});