// src/utils/queryPreprocessor.js

function extractFilters(query) {
  const lower = query.toLowerCase();
  const result = {
    yearMin: null,
    yearMax: null,
    ratingMin: null,
    modifiers: { more: [], less: [] },
    excludeGenres: [],
    region: null,   // new
  };

  // Year range: "2015-2022", "2015 to 2022", "from 2015 to 2022"
  const yearRangeMatch = lower.match(/(?:from\s*)?(\d{4})\s*(?:to|-)\s*(\d{4})/);
  if (yearRangeMatch) {
    result.yearMin = parseInt(yearRangeMatch[1]);
    result.yearMax = parseInt(yearRangeMatch[2]);
  } else {
    // "after 2015" / "before 2020"
    const afterMatch = lower.match(/(?:after|since|from)\s*(\d{4})/);
    if (afterMatch) result.yearMin = parseInt(afterMatch[1]);
    const beforeMatch = lower.match(/(?:before|until)\s*(\d{4})/);
    if (beforeMatch) result.yearMax = parseInt(beforeMatch[1]);
  }

  // Rating: "rating >7", "rating above 8", "rating >=7.5"
  // Rating extraction – supports natural language
  // Rating: "rating >7", "rating above 7", "rating >=7.5", "high rated above 7", "rated above 8", "above 7 stars"
  // Rating extraction – supports numbers and natural language
  let ratingMin = null;
  const ratingRegexes = [
    /rating\s*(?:>=?|above)\s*(\d+(?:\.\d+)?)/i,
    /high(?:est)?\s*rated\s*(?:above|>=?)?\s*(\d+(?:\.\d+)?)?/i,
    /rated\s*above\s*(\d+(?:\.\d+)?)/i,
    /above\s*(\d+(?:\.\d+)?)\s*(?:stars?|rating)/i,
    /(?:>=?|above)\s*(\d+(?:\.\d+)?)\s*stars?/i,
    /(?:don'?t\s*want|no)\s*low\s*rated/i,
    /top\s*rated/i,
    /critically\s*acclaimed/i
  ];
  for (const re of ratingRegexes) {
    const match = query.match(re);
    if (match) {
      if (match[1]) {
        ratingMin = parseFloat(match[1]);
      } else {
        // Natural language like "high rated" or "no low rated" defaults to 7.0 minimum
        ratingMin = 7.0;
      }
      if (!isNaN(ratingMin)) break;
    }
  }
  if (ratingMin !== null) result.ratingMin = ratingMin;

  // Modifiers: "less violence", "more action"
  const moreMatches = [...query.matchAll(/\bmore\s+(\w+)/gi)];
  moreMatches.forEach(m => result.modifiers.more.push(m[1].toLowerCase()));
  const lessMatches = [...query.matchAll(/\bless\s+(\w+)/gi)];
  lessMatches.forEach(m => result.modifiers.less.push(m[1].toLowerCase()));

  // Excluded genres: "not romance", "not comedy"
  const notMatches = [...query.matchAll(/\bnot\s+(\w+)/gi)];
  notMatches.forEach(m => result.excludeGenres.push(m[1].toLowerCase()));

   // Region extraction (simple keyword matching)
  //const lower = query.toLowerCase();
  if (lower.includes('south india') || lower.includes('south indian') || lower.includes('tamil') || lower.includes('telugu')) {
    result.region = 'south';
  } else if (lower.includes('bollywood') || lower.includes('hindi') || lower.includes('north india')) {
    result.region = 'north';
  }
  // Add more as needed

  return result;
}

export { extractFilters };