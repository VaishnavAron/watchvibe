// src/utils/intentFormatter.js

/**
 * Build parsedIntent section from entity data and route info
 * @param {object} validEntities - array of { label, name }
 * @param {string} ragSource - e.g., 'graph-vector-backend'
 * @param {object} referenceMovie - the resolved reference movie
 * @returns {object} parsedIntent
 */
export function formatParsedIntent(validEntities, ragSource, referenceMovie) {
  const genres = validEntities
    .filter(e => e.label === 'Genre')
    .map(e => e.name);
  const moods = validEntities
    .filter(e => e.label === 'Theme')
    .map(e => e.name);
  const reference = referenceMovie?.title || 'Unknown';
  return {
    genres,
    moods,
    reference,
    ragSource
  };
}

/**
 * Build userContext from profile and session filters
 * @param {string} userId 
 * @param {object} filters - extracted filters with more/less arrays
 * @returns {object} userContext
 */
export function formatUserContext(userId, filters) {
  const boosts = [];
  // Add boosts based on modifier filters (more = positive, less = negative)
  if (filters?.modifiers?.more) {
    filters.modifiers.more.forEach(term => {
      boosts.push({ type: 'genre', value: term, weight: '+0.15' });
    });
  }
  if (filters?.modifiers?.less) {
    filters.modifiers.less.forEach(term => {
      boosts.push({ type: 'genre', value: term, weight: '-0.15' });
    });
  }
  // If no boosts, we can still show active region filter as a boost
  if (filters?.region) {
    boosts.push({ type: 'region', value: filters.region, weight: '+0.10' });
  }
  return {
    userId,
    activeBoosts: boosts
  };
}