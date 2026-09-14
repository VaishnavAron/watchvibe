// src/utils/metricsHelper.js

/**
 * Wraps an async function and returns { result, latencyMs }
 */
export async function withLatency(fn) {
  const start = performance.now();
  const result = await fn();
  const latencyMs = Math.round(performance.now() - start);
  return { result, latencyMs };
}

/**
 * Estimate token count from text (1 word ≈ 1.3 tokens)
 */
export function estimateTokens(text) {
  if (!text) return 0;
  const words = text.trim().split(/\s+/).length;
  return Math.ceil(words * 1.3);
}

/**
 * Estimate total LLM tokens based on query and explanations
 * @param {string} query - original user query
 * @param {string[]} explanations - array of XAI explanation strings
 * @returns {{ inputTokens: number, outputTokens: number, totalTokens: number }}
 */
export function estimateTotalTokens(query, explanations = []) {
  // Rough input: query + average system prompt length (~200 words)
  const inputText = query + ' system prompt placeholder about 200 words';
  const inputTokens = estimateTokens(inputText);
  const outputText = explanations.join(' ');
  const outputTokens = estimateTokens(outputText);
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens
  };
}

/**
 * Estimate cost in USD (Groq: $0.0002 per 1k tokens)
 */
export function estimateCost(totalTokens) {
  return (totalTokens / 1000) * 0.0002;
}