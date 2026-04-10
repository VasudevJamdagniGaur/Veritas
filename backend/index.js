const path = require("path");
const { loadEnvFiles } = require("./src/lib/loadEnv");

// `__dirname` is the backend folder (next to package.json) — not process.cwd().
loadEnvFiles(__dirname);

require("./src/index");
