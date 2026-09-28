const mongoose = require('mongoose');
const { getMongoConfig } = require('./config');

let connected = false;

async function connectMongo() {
  if (connected && mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  // If already in the process of connecting (readyState=2), wait for it
  // rather than calling mongoose.connect() again which can throw or race.
  if (mongoose.connection.readyState === 2) {
    await new Promise((resolve, reject) => {
      const onConnected = () => { cleanup(); resolve(); };
      const onError = (err) => { cleanup(); reject(err); };
      const cleanup = () => {
        mongoose.connection.removeListener('connected', onConnected);
        mongoose.connection.removeListener('error', onError);
      };
      mongoose.connection.once('connected', onConnected);
      mongoose.connection.once('error', onError);
    });
    connected = true;
    return mongoose.connection;
  }

  const cfg = getMongoConfig();
  await mongoose.connect(cfg.mongoUri, {
    dbName: cfg.dbName,
    maxPoolSize: cfg.maxPoolSize,
  });
  connected = true;
  return mongoose.connection;
}

async function disconnectMongo() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  connected = false;
}

module.exports = {
  connectMongo,
  disconnectMongo,
};

