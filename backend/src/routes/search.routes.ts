'use strict';

import express from 'express';
import { requireAuth } from '../middleware/auth';
import controller from '../controllers/searchController';

const router = express.Router();

router.use(requireAuth);

router.get('/', controller.searchGlobal);

export default router;

