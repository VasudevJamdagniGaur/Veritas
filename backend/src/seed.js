const path = require("path");
const { loadEnvFiles } = require("./lib/loadEnv");
loadEnvFiles(path.join(__dirname, ".."));

const { getEnv, resolveOpenAiApiKey } = require("./lib/env");
const { connectDb } = require("./lib/db");
const User = require("./models/User");
const Post = require("./models/Post");
const { calculateFinalScore, calculateBotScore, clamp } = require("./lib/scoring");
const { analyzeText } = require("./lib/openai");

async function seed() {
  const env = getEnv();
  await connectDb(env.MONGODB_URI);

  await Promise.all([User.deleteMany({}), Post.deleteMany({})]);

  const user1 = await User.create({
    username: "suspicious_newbie",
    trustScore: 35,
    botScore: 85,
    isHumanVerified: false,
    socialHandle: "",
  });

  const user2 = await User.create({
    username: "verified_human",
    trustScore: 78,
    botScore: 20,
    isHumanVerified: true,
    socialHandle: "@verified_human",
  });

  user1.botScore = clamp(calculateBotScore(user1), 0, 100);
  user2.botScore = clamp(calculateBotScore(user2), 0, 100);
  await Promise.all([user1.save(), user2.save()]);

  const demoPosts = [
    {
      username: user1.username,
      userId: user1._id,
      content:
        "BREAKING: Scientists CONFIRM the vaccine contains microchips and the cure is a secret herb they don't want you to know about. Share now!",
      source: "seed",
    },
    {
      username: user2.username,
      userId: user2._id,
      content:
        "Update: Here are the primary sources for the report, plus a short summary of what’s confirmed vs. still unclear. Stay skeptical and check citations.",
      source: "seed",
    },
  ];

  for (const p of demoPosts) {
    const user = await User.findById(p.userId);
    const analysis = await analyzeText({
      apiKey: resolveOpenAiApiKey(env),
      model: env.OPENAI_MODEL,
      text: p.content,
    });

    const aiScore = clamp(Number(analysis.aiScore ?? 50), 0, 100);
    const aiGeneratedProbability = clamp(
      Number(analysis.aiGeneratedProbability ?? 0.5),
      0,
      1
    );
    const explanation = String(analysis.explanation || "No explanation available.");

    const botScore = clamp(calculateBotScore(user), 0, 100);
    const finalScore = calculateFinalScore(aiScore, user.trustScore, botScore);

    await Post.create({
      content: p.content,
      aiScore,
      aiGeneratedProbability,
      finalScore,
      explanation,
      userId: user._id,
      username: user.username,
      source: p.source,
    });
  }

  // eslint-disable-next-line no-console
  console.log("Seed complete:");
  // eslint-disable-next-line no-console
  console.log(`- Users: ${await User.countDocuments()}`);
  // eslint-disable-next-line no-console
  console.log(`- Posts: ${await Post.countDocuments()}`);
  process.exit(0);
}

seed().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

