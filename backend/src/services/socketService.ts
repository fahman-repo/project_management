import { Server } from 'socket.io';

let io: Server | null = null;

export function init(instance: Server): void {
  io = instance;
}

export function getIO(): Server | null {
  return io;
}

export function isReady(): boolean {
  return Boolean(io);
}

export function emitGlobal(event: string, payload: any): void {
  if (!io) return;
  io.to('global').emit(event, payload);
}

export function emitToProject(projectId: number | string, event: string, payload: any): void {
  if (!io || !projectId) return;
  io.to(`project:${projectId}`).emit(event, payload);
}

export function emitToUser(userId: number | string, event: string, payload: any): void {
  if (!io || !userId) return;
  io.to(`user:${userId}`).emit(event, payload);
}

export function emitTaskEvent(projectId: number, event: string, payload: any): void {
  emitToProject(projectId, event, payload);
  emitGlobal(event, payload);
}

export function emitProjectEvent(projectId: number, event: string, payload: any): void {
  emitToProject(projectId, event, payload);
  emitGlobal(event, payload);
}

export default {
  init,
  getIO,
  isReady,
  emitGlobal,
  emitToProject,
  emitToUser,
  emitTaskEvent,
  emitProjectEvent,
};

