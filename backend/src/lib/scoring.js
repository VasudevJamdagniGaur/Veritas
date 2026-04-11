function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function calculateFinalScore(aiScore, trustScore, botScore) {
  const final =
    aiScore * 0.6 + trustScore * 0.3 + (100 - botScore) * 0.1;
  return clamp(Math.round(final), 0, 100);
}

function calculateBotScore(user) {
  // Simple heuristic MVP:
  // - Not verified => higher botScore
  // - New account (created recently) => higher botScore
  // - No social linked => moderate increase
  let score = 40;

  if (!user.isHumanVerified) score += 30;
  const hasSocial =
    user.socialHandle ||
    user.socialUrl ||
    user.linkedinUrl ||
    user.redditUsername ||
    user.instagramHandle ||
    user.xHandle;
  if (!hasSocial) score += 10;

  const createdAt = user.createdAt ? new Date(user.createdAt).getTime() : null;
  if (createdAt) {
    const accountAgeDays = (Date.now() - createdAt) / (1000 * 60 * 60 * 24);
    if (accountAgeDays < 2) score += 20;
    else if (accountAgeDays < 7) score += 10;
  }

  return clamp(Math.round(score), 0, 100);
}

module.exports = { calculateFinalScore, calculateBotScore, clamp };

