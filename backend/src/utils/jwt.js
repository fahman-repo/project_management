'use strict';

const jwt = require('jsonwebtoken');
const env = require('../config/env');

/**
 * @param {{id:number, role:string, email:string}} user
 */
function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, email: user.email },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN }
  );
}

/**
 * @param {string} token
 */
function verifyToken(token) {
  return jwt.verify(token, env.JWT_SECRET);
}

/**
 * Decode without verifying - used only for logging.
 * @param {string} token
 */
function decodeToken(token) {
  return jwt.decode(token);
}

module.exports = { signToken, verifyToken, decodeToken };
