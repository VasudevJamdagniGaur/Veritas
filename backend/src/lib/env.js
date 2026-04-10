const { z } = require("zod");

const EnvSchema = z.object({
  PORT: z.coerce.number().default(5000),
  MONGODB_URI: z.string().min(1),
  /** Google Cloud project for Vertex AI (reel visual analysis). Override in .env if different. */
  VERTEX_PROJECT: z.string().optional().default("project-c212527d-22ac-4bbe-aaf"),
  VERTEX_LOCATION: z.string().optional().default("us-central1"),
  /** e.g. gemini-1.5-flash, gemini-1.5-pro, gemini-2.0-flash-001 (region-dependent) */
  VERTEX_MODEL: z.string().optional().default("gemini-1.5-flash"),
  OPENAI_API_KEY: z.string().optional().default(""),
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

module.exports = { getEnv };

