// backend/src/engine/synthesis/GroundedSynthesizer.js
import { llm } from "../../core/2_config.js";

/**
 * GroundedSynthesizer implements Stage 2 of the production conversational pipeline.
 * It generates assistant messages AFTER database retrieval and hard invariant verification,
 * strictly grounded on the movies actually displayed to the user.
 */
export class GroundedSynthesizer {
  /**
   * Synthesize a grounded conversational response.
   * @param {Object} params
   * @param {string} params.query - Active user prompt
   * @param {SearchState} params.state - Canonical search state
   * @param {Array} params.verifiedMovies - Verified movies passing the invariant barrier
   * @param {Array} params.relaxedMatches - Relaxed suggestions (if sparse)
   * @param {Array} params.history - Conversational history
   * @returns {Promise<string>} Grounded assistant message
   */
  static async synthesize({
    query = "",
    state,
    verifiedMovies = [],
    relaxedMatches = [],
    history = []
  }) {
    // 1. Edge Case: Zero matches in database
    if (verifiedMovies.length === 0 && relaxedMatches.length === 0) {
      const constraints = state ? state.toHumanDescription() : query;
      return `I couldn't find any titles in our catalog strictly matching "${constraints}". Try adjusting your filters or exploring related genres.`;
    }

    // 2. Edge Case: Sparse exact matches with relaxed suggestions
    if (verifiedMovies.length === 0 && relaxedMatches.length > 0) {
      const topRelaxed = relaxedMatches.slice(0, 3).map(m => `"${m.title}" (${m.year || 'N/A'})`).join(", ");
      return `No exact matches were found for your strict criteria, but I found closely related titles like ${topRelaxed}.`;
    }

    // Prepare candidate context for LLM grounding (top 5 titles only to conserve tokens & latency)
    const topCandidates = verifiedMovies.slice(0, 5).map(m => ({
      title: m.title,
      year: m.year,
      rating: m.rating ? Number(m.rating).toFixed(1) : null,
      genres: (m.genres || []).slice(0, 3),
      source: m.ragSource || "database"
    }));

    const systemPrompt = `You are the expert cinematic conversational copilot for WatchVibe.
Your job is to summarize the ACTUAL verified movies retrieved from the database.

STRICT GROUNDING RULES:
1. ONLY mention or refer to movies listed in VERIFIED MOVIES below.
2. NEVER mention or hallucinate movies that are not in the list.
3. Keep the response to 1-2 concise, engaging, cinema-literate sentences.
4. Highlight how the returned titles fulfill the user's constraints (e.g. release era, rating, or themes).`;

    const userPrompt = `User Query: "${query}"
Active Constraints: ${state ? state.toHumanDescription() : "None"}
Verified Movies (${verifiedMovies.length} total found):
${JSON.stringify(topCandidates, null, 2)}

Write a natural 1-2 sentence response grounded strictly on these verified movies:`;

    try {
      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ];

      const response = await llm.invoke(messages);
      let content = (response.content || "").trim();

      // Clean any accidental quotes wrapping the response
      if (content.startsWith('"') && content.endsWith('"')) {
        content = content.slice(1, -1);
      }

      if (content.length > 0) {
        return content;
      }
    } catch (err) {
      console.warn("[GroundedSynthesizer] LLM synthesis failed, using deterministic fallback:", err.message);
    }

    // Deterministic fallback (guaranteed zero hallucination)
    return GroundedSynthesizer.generateFallback(state, verifiedMovies, relaxedMatches);
  }

  /**
   * Deterministic fallback when LLM is offline or times out.
   */
  static generateFallback(state, verifiedMovies, relaxedMatches) {
    const count = verifiedMovies.length;
    const topTitles = verifiedMovies.slice(0, 3).map(m => `"${m.title}" (${m.year})`).join(", ");
    
    if (state?.filters?.yearMin || state?.filters?.yearMax) {
      const era = `${state.filters.yearMin || 'early'}–${state.filters.yearMax || 'present'}`;
      return `Here are ${count} verified titles from ${era} matching your criteria, including ${topTitles}.`;
    }

    if (state?.filters?.ratingMin) {
      return `Here are ${count} critically acclaimed titles rated ${state.filters.ratingMin}★ or higher, featuring ${topTitles}.`;
    }

    return `Found ${count} cinematic matches matching your preferences, featuring ${topTitles}.`;
  }
}
