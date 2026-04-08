/**
 * Calculate activity score out of 10 based on how many days ago the job was posted.
 * - 0 to 15 days = 8 to 10
 * - 16 to 30 days = 5 to 7
 * - 31 to 45 days = 2 to 4
 * - > 45 days = 1
 */
const calculateActivityScore = (daysPosted, sourceCount = 1) => {
  let baseScore = 1;
  
  if (daysPosted <= 15) {
    baseScore = Math.max(8, Math.round(10 - (daysPosted / 15) * 2));
  } else if (daysPosted <= 30) {
    baseScore = Math.max(5, Math.round(7 - ((daysPosted - 16) / 14) * 2));
  } else if (daysPosted <= 45) {
    baseScore = Math.max(2, Math.round(4 - ((daysPosted - 31) / 14) * 2));
  }
  
  // Exponential urgency multiplier for casting a net across multiple platforms
  // +1.5 activity point for EVERY additional platform they used
  if (sourceCount > 1) {
    baseScore += Math.floor((sourceCount - 1) * 1.5);
  }
  
  // Cap at 10 natively
  return Math.min(10, baseScore);
};

module.exports = { calculateActivityScore };
