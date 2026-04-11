import axios from "axios";

const apiBase = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

export const api = axios.create({
  baseURL: apiBase,
});

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const cfg = error?.config;
    if (!cfg) throw error;

    const shouldRetry =
      (!error?.response && (error?.code === "ERR_NETWORK" || error?.message?.includes("Network Error"))) ||
      error?.response?.status === 502 ||
      error?.response?.status === 503 ||
      error?.response?.status === 504;

    cfg.__veritasRetryCount = cfg.__veritasRetryCount || 0;

    if (shouldRetry && cfg.__veritasRetryCount < 5) {
      cfg.__veritasRetryCount += 1;
      const backoff = 300 * Math.pow(1.6, cfg.__veritasRetryCount);
      await sleep(backoff);
      return api.request(cfg);
    }

    // Clear, visible API error for debugging
    // eslint-disable-next-line no-console
    console.error("API error", {
      url: cfg?.url,
      method: cfg?.method,
      status: error?.response?.status,
      data: error?.response?.data,
      message: error?.message,
    });

    throw error;
  }
);

export type User = {
  _id: string;
  username: string;
  /** 24-char Veritas Wallet ID (letters, digits, symbols), set at signup */
  walletId?: string;
  walletAddress?: string;
  trustScore: number;
  botScore: number;
  isHumanVerified: boolean;
  socialHandle?: string;
  socialUrl?: string;
  /** JPEG data URL kept in browser local storage for avatar preview (not sent to cloud by default) */
  faceCaptureDataUrl?: string;
  /** Optional remote image URL if provided by API */
  faceImageUrl?: string;
  linkedinUrl?: string;
  redditUsername?: string;
  instagramHandle?: string;
  xHandle?: string;
};

export type AnalyzeResponse = {
  aiScore: number;
  aiGeneratedProbability: number;
  explanation: string;
  trustScore: number;
  botScore: number;
  finalScore: number;
  postId: string;
};

