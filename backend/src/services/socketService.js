'use strict';

/**
 * Socket.IO hub.
 *
 * The Express controllers never touch the `io` instance directly - they call the
 * emit helpers exported here. The instance is attached to `app.locals.io` by
 * `sockets/index.js` during boot, so this module stays importable in isolation
 * (e.g. from unit tests).
 */

let io = null;

/**
 * Attach the live Socket.IO server.
 * @param {import('socket.io').Server} instance
 */
function init(instance) {
  io = instance;
}

/** @returns {import('socket.io').Server|null} */
function getIO() {
  return io;
}

/** Whether realtime is currently available. */
function isReady() {
  return Boolean(io);
}

/**
 * Emit to every connected client.
 * @param {string} event
 * @param {any} payload
 */
function emitGlobal(event, payload) {
  if (!io) return;
  io.to('global').emit(event, payload);
}

/**
 * Emit to the room of a single project.
 * @param {number|string} projectId
 * @param {string} event
 * @param {any} payload
 */
function emitToProject(projectId, event, payload) {
  if (!io || !projectId) return;
  io.to(`project:${projectId}`).emit(event, payload);
}

/**
 * Emit to a single user's private room.
 * @param {number|string} userId
 * @param {string} event
 * @param {any} payload
 */
function emitToUser(userId, event, payload) {
  if (!io || !userId) return;
  io.to(`user:${userId}`).emit(event, payload);
}

/**
 * Broadcast a task event to its project room and to the global room.
 * @param {number} projectId
 * @param {string} event
 * @param {any} payload
 */
function emitTaskEvent(projectId, event, payload) {
  emitToProject(projectId, event, payload);
  emitGlobal(event, payload);
}

/**
 * Broadcast a project event to the project room and to the global room.
 * @param {number} projectId
 * @param {string} event
 * @param {any} payload
 */
function emitProjectEvent(projectId, event, payload) {
  emitToProject(projectId, event, payload);
  emitGlobal(event, payload);
}

module.exports = {
  init,
  getIO,
  isReady,
  emitGlobal,
  emitToProject,
  emitToUser,
  emitTaskEvent,
  emitProjectEvent,
};
