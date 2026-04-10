const SENIOR_KEYWORDS = ['vp', 'head', 'director'];

/**
 * Calculate activity score out of 10 based on:
 * - recency band (0-15 => 8-10, 16-30 => 5-7, 31-45 => 2-4, >45 => 1)
 * - +1 bonus for appearing in 2+ sources
 * - +1 bonus for senior title (VP/Head/Director)
 */
const calculateActivityScore = (daysPosted, sourceCount = 1, title = '') => {
  let score = 1;

  if (daysPosted <= 15) {
    score = Math.max(8, Math.round(10 - (daysPosted / 15) * 2));
  } else if (daysPosted <= 30) {
    score = Math.max(5, Math.round(7 - ((daysPosted - 16) / 14) * 2));
  } else if (daysPosted <= 45) {
    score = Math.max(2, Math.round(4 - ((daysPosted - 31) / 14) * 2));
  }

  if (sourceCount >= 2) {
    score += 1;
  }

  const normalizedTitle = String(title || '').toLowerCase();
  if (SENIOR_KEYWORDS.some((kw) => normalizedTitle.includes(kw))) {
    score += 1;
  }

  return Math.min(10, score);
};

module.exports = { calculateActivityScore };
