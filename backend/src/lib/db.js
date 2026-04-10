const mongoose = require("mongoose");

async function connectDb(mongoUri) {
  mongoose.set("strictQuery", true);
  await mongoose.connect(mongoUri, { autoIndex: true });
}

function isDbReady() {
  return mongoose.connection.readyState === 1;
}

module.exports = { connectDb, isDbReady };

