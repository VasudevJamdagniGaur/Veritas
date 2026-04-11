const axios = require("axios");
const { fetchAllNewsSources } = require("./newsFetchers");
const { resolveOpenAiApiKey } = require("./env");

function parseJsonFromAssistantContent(content) {
  let s = String(content || "").trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(s);
  if (fence) s = fence[1].trim();
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first === -1 || last === -1 || last < first) throw new Error("No JSON in model response");
  return JSON.parse(s.slice(first, last + 1));
}

async function openAiChatJson({ apiKey, model, system, user, maxTokens = 1200, jsonObjectMode = true }) {
  const body = {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.25,
    max_tokens: maxTokens,
  };
  if (jsonObjectMode && /gpt-4|gpt-3\.5|gpt-5|o1|o3|o4/i.test(model)) {
    body.response_format = { type: "json_object" };
  }

  const resp = await axios.post("https://api.openai.com/v1/chat/completions", body, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    timeout: 120000,
  });
  const content = resp.data?.choices?.[0]?.message?.content ?? "";
  return parseJsonFromAssistantContent(content);
}

function mockFactCheck(articleText) {
  const n = String(articleText || "").length;
  const truthScore = 40 + (n % 45);
  return {
    contentLabel: "API not configured",
    mainClaim:
      "Configure OPENAI_API_KEY in backend/.env and restart the server to get Community Notes–style context (satire vs fact vs misleading).",
    searchQueryUsed: "news",
    truthScore,
    verdict: "Unverified",
    explanation:
      "This is a placeholder. Add OPENAI_API_KEY to backend/.env (see .env.example). Optional: NewsAPI / GNews keys improve source snippets.",
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

async function extractSearchKeywords({ apiKey, model, articleText, title, url }) {
  const excerpt = String(articleText).slice(0, 12000);
  const sys =
    "You extract short news search keywords for fact-checking. Respond with JSON only. The user message will ask for JSON.";
  const user = [
    "Return JSON with keys: mainClaim (short), searchKeywords (3-12 words, no quotes, good for news search).",
    "",
    `Page title: ${String(title || "").slice(0, 300)}`,
    `URL: ${String(url || "").slice(0, 800)}`,
    "",
    "POST:",
    excerpt,
  ].join("\n");

  const json = await openAiChatJson({
    apiKey,
    model,
    system: sys,
    user,
    maxTokens: 400,
    jsonObjectMode: true,
  });
  const mainClaim = String(json.mainClaim || "").trim();
  const searchKeywords = String(json.searchKeywords || json.searchQuery || "").trim() || mainClaim.slice(0, 120);
  return { mainClaim: mainClaim || excerpt.slice(0, 200), searchKeywords: searchKeywords.slice(0, 420) };
}

const UNIFIED_SYSTEM = `You help readers understand social posts in the style of X (Twitter) Community Notes: first classify the KIND of content, then explain—never echo the post verbatim.

Hard rules:
- Do NOT paste or lightly rephrase the post as your analysis. No more than 5 consecutive words copied from the post.
- "mainClaim" must be one sentence in neutral, analytical voice: what the post is doing (e.g. joke, satire, serious claim, opinion, rumor) and the topic—written as if explaining to someone who has not read the post.
- If the post is satirical, humorous, or clearly fictional, say so explicitly; truthScore should be low as "literal news accuracy" and verdict often "Unverified"—that is correct for jokes.

Respond with JSON only (no markdown). Keys:
- "contentLabel": string — a short reader-facing label, pick the closest: "Satire or humor" | "Opinion or commentary" | "Likely factual" | "Likely misleading or false" | "Unverified or rumor" | "Mixed"
- "mainClaim": string — one sentence analytical summary (NOT a quote of the post).
- "truthScore": number 0-100 — if the post is satire/joke, use a LOW score for literal factual accuracy (the scenario is not real news). Use higher scores only for posts making real factual claims that check out.
- "verdict": exactly one of: "Likely True", "Mixed / Unclear", "Likely False", "Unverified"
- "explanation": string — 3 to 7 sentences like a Community Note: name whether it is satire/fake news/fact/opinion, why, and what a reader should know. Cite [n] for snippets if provided. If no sources, rely on reasoning and label satire clearly.`;


async function unifiedFactCheck({ apiKey, model, articleText, title, url, sourcesBlock, hadSources }) {
  const excerpt = String(articleText).trim().slice(0, 14000);
  const user = [
    "Classify this post (satire vs serious news vs opinion vs rumor) and explain for readers. Remember: do not repeat the post text as the analysis.",
    "",
    `Page title: ${String(title || "").slice(0, 400)}`,
    `URL: ${String(url || "").slice(0, 1000)}`,
    "",
    "POST TEXT:",
    excerpt,
    "",
    hadSources
      ? "INDEPENDENT SOURCE SNIPPETS (use [n] to refer to them in your explanation):"
      : "NO INDEPENDENT SOURCES WERE RETRIEVED — assess from the post and careful general reasoning; prefer lower confidence or Unverified when needed.",
    "",
    sourcesBlock || "(none)",
  ].join("\n");

  return openAiChatJson({
    apiKey,
    model,
    system: UNIFIED_SYSTEM,
    user,
    maxTokens: 1400,
    jsonObjectMode: true,
  });
}

function normalizeVerdict(v) {
  const s = String(v || "").toLowerCase();
  if (s.includes("likely true")) return "Likely True";
  if (s.includes("likely false")) return "Likely False";
  if (s.includes("mixed") || s.includes("unclear")) return "Mixed / Unclear";
  return "Unverified";
}

function normalizeContentLabel(s) {
  const t = String(s || "")
    .trim()
    .slice(0, 120);
  return t || "Context";
}

function normalizeUnifiedJson(json) {
  let truthScore = Math.round(Number(json.truthScore));
  if (!Number.isFinite(truthScore)) truthScore = 50;
  truthScore = Math.max(0, Math.min(100, truthScore));
  const mainClaim = String(json.mainClaim || "").trim() || "Context could not be summarized.";
  const contentLabel = normalizeContentLabel(json.contentLabel);
  const verdict = normalizeVerdict(json.verdict);
  const explanation = String(json.explanation || "").trim() || "No explanation returned.";
  return { mainClaim, contentLabel, truthScore, verdict, explanation };
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

  let searchKeywords = articleText.slice(0, 150);
  let keywordMain = articleText.slice(0, 400);

  try {
    const ex = await extractSearchKeywords({ apiKey, model, articleText, title, url });
    searchKeywords = ex.searchKeywords;
    keywordMain = ex.mainClaim;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[fact-check] keyword extraction fallback:", e?.message || e);
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
  const hadSources =
    sourceCounts.newsapi + sourceCounts.gnews + sourceCounts.worldnews + sourceCounts.thenews > 0;

  try {
    const raw = await unifiedFactCheck({
      apiKey,
      model,
      articleText,
      title,
      url,
      sourcesBlock,
      hadSources,
    });
    const u = normalizeUnifiedJson(raw);
    return {
      contentLabel: u.contentLabel,
      mainClaim: u.mainClaim,
      searchQueryUsed: searchKeywords,
      truthScore: u.truthScore,
      verdict: u.verdict,
      explanation: u.explanation,
      sourceCounts,
      sourcesSample,
    };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[fact-check] unified call failed, retrying without sources context:", e?.message || e);
  }

  try {
    const raw = await unifiedFactCheck({
      apiKey,
      model,
      articleText,
      title,
      url,
      sourcesBlock: "",
      hadSources: false,
    });
    const u = normalizeUnifiedJson(raw);
    return {
      contentLabel: u.contentLabel,
      mainClaim: u.mainClaim,
      searchQueryUsed: searchKeywords,
      truthScore: u.truthScore,
      verdict: u.verdict,
      explanation: u.explanation,
      sourceCounts,
      sourcesSample,
    };
  } catch (e2) {
    // eslint-disable-next-line no-console
    console.error("[fact-check] failed:", e2?.message || e2);
    return {
      contentLabel: "Error",
      mainClaim: "Analysis unavailable for this post.",
      searchQueryUsed: searchKeywords,
      truthScore: 50,
      verdict: "Unverified",
      explanation: `Fact-check could not complete: ${String(e2?.message || e2).slice(0, 400)}. Confirm OPENAI_API_KEY and model name in backend/.env.`,
      sourceCounts,
      sourcesSample,
    };
  }
}

module.exports = { runFactCheck, mockFactCheck };
