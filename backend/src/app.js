'use strict';

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');
const env = require('./config/env');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimit');
const routes = require('./routes');

const app = express();

app.set('trust proxy', 1);

// --- Security ---------------------------------------------------------------
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", 'http://localhost:5000', 'http://127.0.0.1:5000', 'ws:', 'wss:'],
        fontSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'self'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

app.use(
  cors({
    origin: [env.FRONTEND_URL, 'http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  })
);

// --- Parsing ----------------------------------------------------------------
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// --- Performance ------------------------------------------------------------
app.use(compression());

// --- Logging ----------------------------------------------------------------
if (env.NODE_ENV !== 'test') {
  app.use(morgan(env.NODE_ENV === 'development' ? 'dev' : 'combined'));
}

// --- Static uploads ---------------------------------------------------------
app.use(
  '/uploads',
  express.static(env.UPLOAD_PATH, {
    maxAge: '7d',
    index: false,
    dotfiles: 'deny',
  })
);

// --- API --------------------------------------------------------------------
app.use('/api/v1', apiLimiter, routes);

// --- Root -------------------------------------------------------------------
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Project Management System API',
    version: '1.0.0',
    docs: '/api/v1/health',
  });
});

// --- Errors -----------------------------------------------------------------
app.use(notFound);
app.use(errorHandler);

module.exports = app;
