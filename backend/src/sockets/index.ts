import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import env from '../config/env';
import { verifyToken } from '../utils/jwt';
import { query } from '../config/database';
import socketService from '../services/socketService';

/**
 * Initialise the Socket.IO server.
 */
export function initSocket(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
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
    } catch (error: any) {
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
 */
export async function broadcastPresence(projectId: number): Promise<void> {
  const io = socketService.getIO();
  if (!io) return;

  const room = io.sockets.adapter.rooms.get(`project:${projectId}`);
  const userIds = new Set<number>();

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

export default { initSocket, broadcastPresence };

