// src/controllers/recommendationController.js
import { buildRecommendationPayload, buildFallbackRecommendationPayload } from '../services/recommendationService_hackathon.js';
import { clean } from '../utils/helpers.js';

const demoUserId = 'demo-user';

export async function recommend(req, res) {
  const query = clean(req.body.query);
  const userId = req.user ? req.user._id.toString() : clean(req.body.userId) || demoUserId;
  const conversationHistory = Array.isArray(req.body.conversationHistory) 
    ? req.body.conversationHistory 
    : (Array.isArray(req.body.history) ? req.body.history : []);

  if (!query) {
    return res.status(400).json({ message: 'Query is required' });
  }

  try {
    const payload = await buildRecommendationPayload(query, userId, conversationHistory);

    // 🔥 The hackathon service now returns `payload.recommendations` (not `results`)
    if (!payload || !payload.recommendations || payload.recommendations.length === 0) {
      return res.json(await buildFallbackRecommendationPayload(query, userId, 'empty_results'));
    }

    res.json(payload);
  } catch (err) {
    console.error('Recommendation fallback:', err.message);
    res.json(await buildFallbackRecommendationPayload(query, userId, err.message));
  }
}