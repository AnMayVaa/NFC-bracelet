// Field trial settings. The consent wording itself lives in public/i18n.js (trial.* keys);
// bump `version` whenever that wording changes, so each consent records what the person agreed to.
module.exports = {
  version: 'v1-2026-10',
  // Survey questions, all 1..5. `overall` is the advisor's "user satisfaction" indicator.
  questions: ['overall', 'aiPicks', 'safety'],
  // Impact panel buckets (catalog crowdLevel 0 quiet .. 1 packed)
  quietBelow: 0.4,
  hotspotFrom: 0.7
};
