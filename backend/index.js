const fs = require("fs");
const path = require("path");
// Always load backend/.env regardless of process.cwd() (IDE / monorepo runs often use the wrong cwd).
const envPath = path.join(__dirname, ".env");
if (!fs.existsSync(envPath)) {
  // eslint-disable-next-line no-console
  console.warn(`[Veritas] Missing ${envPath} — copy backend/.env.example and add secrets.`);
}
require("dotenv").config({ path: envPath, override: true });

require("./src/index");

