const axios = require("axios");

const TIMEOUT_MS = 10000;

function firstNonEmpty(...vals) {
  for (const v of vals) {
    const s = String(v || "").trim();
    if (s) return s;
  }
  return "";
}

/**
 * @returns {{ title: string, snippet: string, url: string, outlet: string }[]}
 */
function normalizeNewsApiArticles(data) {
  const arr = data?.articles || [];
  return arr.slice(0, 8).map((a) => ({
    title: String(a.title || "").slice(0, 300),
    snippet: String(a.description || a.content || "").replace(/<[^>]+>/g, "").slice(0, 500),
    url: String(a.url || ""),
    outlet: String(a.source?.name || "NewsAPI"),
  }));
}

async function fetchNewsApiOrg(query, apiKey) {
  if (!apiKey) return [];
  const q = String(query).slice(0, 420);
  const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&language=en&sortBy=relevancy&pageSize=8`;
  const { data } = await axios.get(url, {
    headers: { "X-Api-Key": apiKey },
    timeout: TIMEOUT_MS,
    validateStatus: () => true,
  });
  if (!data || data.status === "error") return [];
  return normalizeNewsApiArticles(data);
}

function normalizeGNews(data) {
  const arr = data?.articles || [];
  return arr.slice(0, 8).map((a) => ({
    title: String(a.title || "").slice(0, 300),
    snippet: String(a.description || a.content || "").slice(0, 500),
    url: String(a.url || ""),
    outlet: String(a.source?.name || "GNews"),
  }));
}

async function fetchGNews(query, token) {
  if (!token) return [];
  const q = String(query).slice(0, 420);
  const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(q)}&lang=en&max=8&token=${encodeURIComponent(token)}`;
  const { data } = await axios.get(url, { timeout: TIMEOUT_MS, validateStatus: () => true });
  if (data?.errors?.length) return [];
  return normalizeGNews(data);
}

function normalizeWorldNews(data) {
  const arr = data?.news || data?.articles || [];
  return (Array.isArray(arr) ? arr : []).slice(0, 8).map((a) => ({
    title: String(a.title || "").slice(0, 300),
    snippet: String(a.text || a.summary || "").slice(0, 500),
    url: String(a.url || ""),
    outlet: String(a.source || "WorldNewsAPI"),
  }));
}

async function fetchWorldNewsApi(query, apiKey) {
  if (!apiKey) return [];
  const q = String(query).slice(0, 420);
  const url = `https://api.worldnewsapi.com/search-news?text=${encodeURIComponent(q)}&number=8&language=en`;
  const { data } = await axios.get(url, {
    headers: { "x-api-key": apiKey },
    timeout: TIMEOUT_MS,
    validateStatus: () => true,
  });
  return normalizeWorldNews(data);
}

function normalizeTheNews(data) {
  const arr = data?.data || data?.news || [];
  const list = Array.isArray(arr) ? arr : [];
  return list.slice(0, 8).map((a) => ({
    title: String(a.title || "").slice(0, 300),
    snippet: String(a.snippet || a.description || a.text || "").slice(0, 500),
    url: String(a.url || a.link || "").slice(0, 2000),
    outlet: String(a.source || a.domain || a.source_name || "TheNewsAPI"),
  }));
}

async function fetchTheNewsApi(query, apiToken) {
  if (!apiToken) return [];
  const q = String(query).slice(0, 420);
  const url = `https://api.thenewsapi.com/v1/news/all?api_token=${encodeURIComponent(apiToken)}&language=en&limit=8&search=${encodeURIComponent(q)}`;
  const { data } = await axios.get(url, { timeout: TIMEOUT_MS, validateStatus: () => true });
  return normalizeTheNews(data);
}

/**
 * Aggregate headlines from all configured providers (failures become empty arrays).
 * @param {object} env — parsed env with NEWSAPI_KEY, etc.
 * @param {string} searchQuery
 */
async function fetchAllNewsSources(env, searchQuery) {
  const q = searchQuery.trim().slice(0, 450);
  const newsApiKey = firstNonEmpty(env.NEWSAPI_KEY, env.NEWSAPI_KEY_2);
  const gnewsKey = firstNonEmpty(env.GNEWS_API_KEY, env.GNEWS_API_KEY_2);
  const worldKey = firstNonEmpty(env.WORLDNEWS_API_KEY, env.WORLDNEWS_API_KEY_2);
  const theNewsTok = firstNonEmpty(env.THENEWS_API_TOKEN, env.THENEWS_API_TOKEN_2);

  const [na, gn, wn, tn] = await Promise.allSettled([
    fetchNewsApiOrg(q, newsApiKey),
    fetchGNews(q, gnewsKey),
    fetchWorldNewsApi(q, worldKey),
    fetchTheNewsApi(q, theNewsTok),
  ]);

  const pick = (r) => (r.status === "fulfilled" ? r.value : []);

  return {
    newsapi: pick(na),
    gnews: pick(gn),
    worldnews: pick(wn),
    thenews: pick(tn),
  };
}

module.exports = {
  fetchAllNewsSources,
  firstNonEmpty,
};
