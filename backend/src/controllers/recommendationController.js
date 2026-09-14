// src/controllers/recommendationController.js
import { SearchEngine } from '../engine/SearchEngine.js';
import { clean } from '../utils/helpers.js';

const demoUserId = 'demo-user';

export async function recommend(req, res) {
  const query = clean(req.body.query);
  const userId = req.user ? req.user._id.toString() : clean(req.body.userId) || demoUserId;
  const conversationHistory = Array.isArray(req.body.conversationHistory) 
    ? req.body.conversationHistory 
    : (Array.isArray(req.body.history) ? req.body.history : []);
  const currentState = req.body.state || null;

  if (!query) {
    return res.status(400).json({ message: 'Query is required' });
  }

  try {
    const payload = await SearchEngine.search({
      query,
      currentState,
      history: conversationHistory,
      userId
    });

    res.json({
      success: true,
      query,
      userId,
      ...payload
    });
  } catch (err) {
    console.error('[recommendationController] SearchEngine error:', err.message);
    res.status(500).json({
      success: false,
      error: err.message,
      results: [],
      recommendations: [],
      assistantMessage: "I encountered an issue processing your recommendation request. Please try again."
    });
  }
}