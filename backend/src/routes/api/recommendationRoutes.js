import express from 'express';

import { queryRecommendations } from '../../controllers/recommendationController.js';

const router = express.Router();

router.post('/recommendations/query', queryRecommendations);

export default router;
