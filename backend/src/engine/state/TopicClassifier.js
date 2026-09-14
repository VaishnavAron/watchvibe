// backend/src/engine/state/TopicClassifier.js
/**
 * TopicClassifier detects whether an incoming user prompt is an incremental
 * refinement of the active search session or a context switch / brand-new search.
 */

const PIVOT_TRIGGERS = [
  /switch\s+to/i,
  /instead\s+of/i,
  /forget\s+that/i,
  /something\s+different/i,
  /new\s+topic/i,
  /start\s+over/i,
  /how\s+about/i,
  /movies\s+like\s+([A-Z0-9a-z\s]+)/i,
  /recommend\s+([A-Z0-9a-z\s]+)/i,
];

const REFINEMENT_TRIGGERS = [
  /\b(only|just|also|make\s+it|keep|exclude|without|more|less)\b/i,
  /\b(from\s+the|before|after|during|in\s+the)\s+(\d{2}s|\d{4})/i,
  /\b(rating|rated|stars?)\b/i,
  /\b(critically\s+acclaimed|top\s+rated|high\s+rated)\b/i,
];

export function classifyTopicTransition(query, currentState) {
  const q = query.trim();

  // If there are no existing filters or entities, it is always a NEW_SEARCH
  if (!currentState || (currentState.entities.length === 0 && !currentState.referenceMovie && !currentState.franchise)) {
    return { isTopicSwitch: true, reason: "INITIAL_SEARCH" };
  }

  // Explicit pivot phrase check
  for (const re of PIVOT_TRIGGERS) {
    if (re.test(q)) {
      return { isTopicSwitch: true, reason: "EXPLICIT_PIVOT_KEYWORD" };
    }
  }

  // Explicit refinement check
  for (const re of REFINEMENT_TRIGGERS) {
    if (re.test(q)) {
      return { isTopicSwitch: false, reason: "REFINEMENT_PATTERN_MATCH" };
    }
  }

  // Short natural follow-ups default to refinement if state is active
  const words = q.split(/\s+/);
  if (words.length <= 5) {
    return { isTopicSwitch: false, reason: "SHORT_FOLLOWUP" };
  }

  // Longer multi-word descriptions without refinement terms usually signify a new topic
  return { isTopicSwitch: true, reason: "NEW_FULL_QUERY" };
}
