import express from 'express';

import { createInteraction, createUserSession, getUserContext, getUserProfile } from '../../controllers/userController.js';

const router = express.Router();

router.post('/user/session', createUserSession);
router.get('/user/profile', getUserProfile);
router.get('/user/context', getUserContext);
router.post('/interactions', createInteraction);

export default router;
