const { z } = require("zod");

const EnvSchema = z.object({
  PORT: z.coerce.number().default(5000),
  MONGODB_URI: z.string().min(1),
  /** OpenAI API key for text + reel vision (keep in .env only; never commit). */
  OPENAI_API_KEY: z.string().optional().default(""),
  /**
   * Optional alias for the same key (e.g. if you copied from a CRA-style .env).
   * Prefer OPENAI_API_KEY for this Node server.
   */
  REACT_APP_OPENAI_API_KEY: z.string().optional().default(""),
  /** Use a vision-capable model for reel frames (e.g. gpt-4o-mini, gpt-4o). */
  OPENAI_MODEL: z.string().optional().default("gpt-4o-mini"),
  JWT_SECRET: z.string().min(1).default("dev-secret-change-me"),
  CHAIN_ENABLED: z
    .string()
    .optional()
    .default("false")
    .transform((v) => v.toLowerCase() === "true"),
  RPC_URL: z.string().optional().default("http://127.0.0.1:8545"),
  VERITAS_CONTRACT_ADDRESS: z.string().optional().default(""),
  SIGNER_PRIVATE_KEY: z.string().optional().default(""),
});

function getEnv() {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return parsed.data;
}

function cleanSecret(v) {
  if (v == null) return "";
  let s = String(v).trim();
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1).trim();
  return s;
}

/**
 * Resolved API key for OpenAI.
 * Reads process.env first (what dotenv loads from backend/.env), then the getEnv() snapshot.
 * Priority: REACT_APP_OPENAI_API_KEY → OPENAI_API_KEY (matches common .env naming for this project).
 */
function resolveOpenAiApiKey(env) {
  const fromProcess =
    cleanSecret(process.env.REACT_APP_OPENAI_API_KEY) ||
    cleanSecret(process.env.OPENAI_API_KEY);
  if (fromProcess) return fromProcess;
  const e = env || {};
  return cleanSecret(e.REACT_APP_OPENAI_API_KEY) || cleanSecret(e.OPENAI_API_KEY);
}

module.exports = { getEnv, resolveOpenAiApiKey };
