const axios = require("axios");
const { fetchAllNewsSources } = require("./newsFetchers");
const { resolveOpenAiApiKey } = require("./env");

function parseJsonFromAssistantContent(content) {
  const s = String(content || "");
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first === -1 || last === -1) throw new Error("No JSON in model response");
  return JSON.parse(s.slice(first, last + 1));
}

async function openAiChatJson({ apiKey, model, system, user, maxTokens = 1200 }) {
  const resp = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.2,
      max_tokens: maxTokens,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 90000,
    }
  );
  const content = resp.data?.choices?.[0]?.message?.content ?? "";
  return parseJsonFromAssistantContent(content);
}

function mockFactCheck(articleText) {
  const n = String(articleText || "").length;
  const truthScore = 40 + (n % 45);
  return {
    mainClaim: "Mock: set OPENAI_API_KEY and optional news API keys for live fact-checking.",
    searchQueryUsed: "news",
    truthScore,
    verdict: "Unverified",
    explanation:
      "This is a placeholder response. Configure OPENAI_API_KEY in backend/.env. Add NewsAPI, GNews, WorldNewsAPI, and/or TheNewsAPI keys for source retrieval.",
    sourceCounts: { newsapi: 0, gnews: 0, worldnews: 0, thenews: 0 },
    sourcesSample: [],
  };
}

function buildSourcesPayload(bundles) {
  const lines = [];
  const sample = [];
  let i = 0;
  for (const [provider, items] of Object.entries(bundles)) {
    for (const it of items) {
      i += 1;
      sample.push({ outlet: it.outlet, title: it.title, url: it.url });
      lines.push(
        `[${i}] (${provider}) ${it.outlet}\nTitle: ${it.title}\nSnippet: ${it.snippet}\nURL: ${it.url}`
      );
    }
  }
  return { text: lines.join("\n\n"), sample: sample.slice(0, 12) };
}

async function extractClaim({ apiKey, model, articleText, title, url }) {
  const excerpt = String(articleText).slice(0, 14000);
  const sys =
    "You extract the single most checkable factual claim from news-style text. Return strict JSON only.";
  const user = [
    "From the article below, output JSON:",
    '{ "mainClaim": string (one concise claim to fact-check), "searchKeywords": string (3-10 words, optimized for news search, no quotes) }',
    "",
    `Page title: ${String(title || "").slice(0, 300)}`,
    `URL: ${String(url || "").slice(0, 800)}`,
    "",
    "ARTICLE:",
    excerpt,
  ].join("\n");

  const json = await openAiChatJson({
    apiKey,
    model,
    system: sys,
    user,
    maxTokens: 500,
  });
  const mainClaim = String(json.mainClaim || "").trim();
  const searchKeywords = String(json.searchKeywords || json.searchQuery || "").trim() || mainClaim.slice(0, 120);
  if (!mainClaim) throw new Error("Could not extract a main claim");
  return { mainClaim, searchKeywords: searchKeywords.slice(0, 420) };
}

async function verifyClaim({
  apiKey,
  model,
  mainClaim,
  sourcesBlock,
  hadSources,
}) {
  const sys =
    "You are a careful fact-checking assistant. Compare the claim to the source snippets. Return strict JSON only. Be explicit when evidence is thin.";
  const user = [
    "CLAIM TO VERIFY:",
    mainClaim,
    "",
    hadSources ? "INDEPENDENT SOURCE SNIPPETS (may be incomplete):" : "NO EXTERNAL SOURCES WERE RETRIEVED — rely on general knowledge cautiously and lower confidence.",
    sourcesBlock || "(none)",
    "",
    "Return JSON:",
    '{ "truthScore": number (0-100, how well supported / accurate the claim appears),',
    '"verdict": "Likely True" | "Mixed / Unclear" | "Likely False" | "Unverified",',
    '"explanation": string (2-5 sentences, cite source numbers [n] when used)"',
  ].join("\n");

  const json = await openAiChatJson({
    apiKey,
    model,
    system: sys,
    user,
    maxTokens: 900,
  });
  let truthScore = Math.round(Number(json.truthScore));
  if (!Number.isFinite(truthScore)) truthScore = 50;
  truthScore = Math.max(0, Math.min(100, truthScore));
  const verdict = String(json.verdict || "Unverified").trim();
  const explanation = String(json.explanation || "").trim() || "No explanation returned.";
  return { truthScore, verdict, explanation };
}

function normalizeVerdict(v) {
  const s = String(v || "").toLowerCase();
  if (s.includes("likely true")) return "Likely True";
  if (s.includes("likely false")) return "Likely False";
  if (s.includes("mixed") || s.includes("unclear")) return "Mixed / Unclear";
  return "Unverified";
}

/**
 * @param {object} opts
 * @param {object} opts.env — getEnv() result
 * @param {string} opts.text
 * @param {string} [opts.url]
 * @param {string} [opts.title]
 */
async function runFactCheck({ env, text, url, title }) {
  const apiKey = resolveOpenAiApiKey(env);
  const model = env.OPENAI_MODEL || "gpt-4o-mini";

  if (!apiKey) {
    return mockFactCheck(text);
  }

  const articleText = String(text || "").trim();
  let mainClaim;
  let searchKeywords;

  try {
    const ex = await extractClaim({ apiKey, model, articleText, title, url });
    mainClaim = ex.mainClaim;
    searchKeywords = ex.searchKeywords;
  } catch {
    mainClaim = articleText.slice(0, 400);
    searchKeywords = articleText.slice(0, 120);
  }

  let bundles;
  try {
    bundles = await fetchAllNewsSources(env, searchKeywords);
  } catch {
    bundles = { newsapi: [], gnews: [], worldnews: [], thenews: [] };
  }

  const sourceCounts = {
    newsapi: bundles.newsapi.length,
    gnews: bundles.gnews.length,
    worldnews: bundles.worldnews.length,
    thenews: bundles.thenews.length,
  };

  const { text: sourcesBlock, sample: sourcesSample } = buildSourcesPayload(bundles);
  const hadSources = sourceCounts.newsapi + sourceCounts.gnews + sourceCounts.worldnews + sourceCounts.thenews > 0;

  let verification;
  try {
    verification = await verifyClaim({
      apiKey,
      model,
      mainClaim,
      sourcesBlock,
      hadSources,
    });
  } catch {
    verification = {
      truthScore: 50,
      verdict: "Unverified",
      explanation: "Verification step failed. Try again or check API configuration.",
    };
  }

  return {
    mainClaim,
    searchQueryUsed: searchKeywords,
    truthScore: verification.truthScore,
    verdict: normalizeVerdict(verification.verdict),
    explanation: verification.explanation,
    sourceCounts,
    sourcesSample,
  };
}

module.exports = { runFactCheck, mockFactCheck };
