'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const controller = require('../controllers/searchController');

const router = express.Router();

router.use(requireAuth);

router.get('/', controller.searchGlobal);

module.exports = router;

