import express from 'express';

import { getHomeCollections } from '../../controllers/collectionController.js';

const router = express.Router();

router.get('/collections/home', getHomeCollections);

export default router;
