import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { getToken } from '../api/client';

let socket = null;
let refCount = 0;

/**
 * Return the shared Socket.IO connection, creating it on first use.
 * The connection is authenticated with the JWT from localStorage.
 */
function ensureSocket() {
  if (socket) return socket;

  socket = io(import.meta.env.VITE_SOCKET_URL || window.location.origin, {
    path: '/socket.io',
    auth: { token: getToken() },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
  });

  return socket;
}

/**
 * Release the shared socket once no component uses it any more.
 */
function releaseSocket() {
  refCount -= 1;
  if (refCount <= 0 && socket) {
    socket.disconnect();
    socket = null;
    refCount = 0;
  }
}

/**
 * React hook wrapping the shared Socket.IO connection.
 *
 * @param {string[]} [events] event names to subscribe to
 * @param {(event:string, payload:any) => void} [onEvent] called for each event
 * @returns {{connected:boolean, socket:import('socket.io-client').Socket|null}}
 */
export function useSocket(events = [], onEvent) {
  const [connected, setConnected] = useState(false);
  const handlerRef = useRef(onEvent);
  const socketRef = useRef(null);

  handlerRef.current = onEvent;

  useEffect(() => {
    const instance = ensureSocket();
    socketRef.current = instance;
    refCount += 1;

    const handleConnect = () => setConnected(true);
    const handleDisconnect = () => setConnected(false);
    const handleConnectError = () => setConnected(false);

    instance.on('connect', handleConnect);
    instance.on('disconnect', handleDisconnect);
    instance.on('connect_error', handleConnectError);

    if (instance.connected) setConnected(true);

    return () => {
      instance.off('connect', handleConnect);
      instance.off('disconnect', handleDisconnect);
      instance.off('connect_error', handleConnectError);
      releaseSocket();
    };
  }, []);

  // Subscribe to the requested events.
  useEffect(() => {
    const instance = socketRef.current;
    if (!instance || !events.length) return undefined;

    const listeners = events.map((event) => {
      const listener = (payload) => handlerRef.current?.(event, payload);
      instance.on(event, listener);
      return { event, listener };
    });

    return () => {
      for (const { event, listener } of listeners) {
        instance.off(event, listener);
      }
    };
  }, [events.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  return { connected, socket: socketRef.current };
}

/**
 * Subscribe to a project room so project-scoped events reach this client.
 * @param {number|string|null} projectId
 */
export function useProjectSubscription(projectId) {
  const { socket, connected } = useSocket([]);

  useEffect(() => {
    if (!socket || !connected) return undefined;
    if (!projectId) {
      return undefined;
    }

    socket.emit('project:subscribe', { projectId: Number(projectId) });
    return () => {
      socket.emit('project:unsubscribe', { projectId: Number(projectId) });
    };
  }, [socket, connected, projectId]);
}

/**
 * Force a socket reconnection, e.g. after the token changes.
 */
export function useReconnectSocket() {
  return useCallback(() => {
    if (socket) socket.connect();
  }, []);
}
