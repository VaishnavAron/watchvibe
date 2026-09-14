// src/utils/stringSimilarity.js
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

export function findClosestActor(actorName, allActorNames, threshold = 3) {
  const lower = actorName.toLowerCase();
  let best = null, bestDist = Infinity;
  for (const name of allActorNames) {
    const dist = levenshtein(lower, name.toLowerCase());
    if (dist < bestDist && dist <= threshold) {
      bestDist = dist;
      best = name;
    }
  }
  return best;
}