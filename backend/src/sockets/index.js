'use strict';

const { Server } = require('socket.io');
const env = require('../config/env');
const { verifyToken } = require('../utils/jwt');
const { query } = require('../config/database');
const socketService = require('../services/socketService');

/**
 * Initialise the Socket.IO server.
 *
 * Clients authenticate with `auth: { token }` in the handshake. Authenticated
 * sockets join the `global` room plus a private `user:{id}` room; they can
 * additionally subscribe to a project room.
 *
 * @param {import('http').Server} httpServer
 * @returns {import('socket.io').Server}
 */
function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: [env.FRONTEND_URL, 'http://localhost:5173', 'http://127.0.0.1:5173'],
      credentials: true,
    },
    pingTimeout: 25000,
    pingInterval: 20000,
  });

  // --- Authentication middleware -------------------------------------------
  io.use(async (socket, next) => {
    const token =
      (socket.handshake.auth && socket.handshake.auth.token) ||
      (socket.handshake.query && socket.handshake.query.token);

    if (!token) {
      return next(new Error('UNAUTHORIZED: token tidak diberikan'));
    }

    try {
      const payload = verifyToken(String(token));
      const rows = await query(
        'SELECT id, name, email, role, avatar FROM users WHERE id = ? AND is_active = 1 LIMIT 1',
        [payload.id]
      );
      const user = rows[0];
      if (!user) return next(new Error('UNAUTHORIZED: pengguna tidak valid'));

      socket.data.user = user;
      return next();
    } catch (error) {
      const message =
        error.name === 'TokenExpiredError'
          ? 'UNAUTHORIZED: sesi berakhir'
          : 'UNAUTHORIZED: token tidak valid';
      return next(new Error(message));
    }
  });

  // --- Connection handling --------------------------------------------------
  io.on('connection', (socket) => {
    const user = socket.data.user;

    socket.join('global');
    socket.join(`user:${user.id}`);

    socket.emit('connected', {
      userId: user.id,
      name: user.name,
      serverTime: new Date().toISOString(),
    });

    /**
     * Join a project room and announce presence.
     * @param {{projectId:number}} payload
     */
    socket.on('project:subscribe', async (payload) => {
      const projectId = Number(payload && payload.projectId);
      if (!projectId) return;

      // Only project members may watch a project room.
      const rows = await query(
        'SELECT id FROM project_members WHERE project_id = ? AND user_id = ? LIMIT 1',
        [projectId, user.id]
      );
      if (!rows.length) return;

      socket.join(`project:${projectId}`);
      socket.data.subscribedProjects = socket.data.subscribedProjects || new Set();
      socket.data.subscribedProjects.add(projectId);

      await broadcastPresence(projectId);
    });

    /**
     * Leave a project room.
     * @param {{projectId:number}} payload
     */
    socket.on('project:unsubscribe', async (payload) => {
      const projectId = Number(payload && payload.projectId);
      if (!projectId) return;

      socket.leave(`project:${projectId}`);
      if (socket.data.subscribedProjects) {
        socket.data.subscribedProjects.delete(projectId);
      }

      await broadcastPresence(projectId);
    });

    socket.on('disconnect', async () => {
      const projects = socket.data.subscribedProjects;
      if (!projects) return;
      for (const projectId of projects) {
        // eslint-disable-next-line no-await-in-loop
        await broadcastPresence(projectId);
      }
    });
  });

  socketService.init(io);
  return io;
}

/**
 * Announce who is currently watching a project.
 * @param {number} projectId
 */
async function broadcastPresence(projectId) {
  const io = socketService.getIO();
  if (!io) return;

  const room = io.sockets.adapter.rooms.get(`project:${projectId}`);
  const userIds = new Set();

  if (room) {
    for (const socketId of room) {
      const socket = io.sockets.sockets.get(socketId);
      if (socket && socket.data.user) userIds.add(socket.data.user.id);
    }
  }

  if (!userIds.size) {
    io.to(`project:${projectId}`).emit('presence:update', { projectId, users: [] });
    return;
  }

  const users = await query(
    `SELECT id, name, avatar, role FROM users WHERE id IN (${[...userIds]
      .map(() => '?')
      .join(', ')})`,
    [...userIds]
  );

  io.to(`project:${projectId}`).emit('presence:update', { projectId, users });
}

module.exports = { initSocket, broadcastPresence };
