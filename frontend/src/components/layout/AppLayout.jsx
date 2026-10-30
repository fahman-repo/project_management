import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { CommandPalette } from '../shared/CommandPalette';
import { useRealtimeInvalidate } from '../../hooks/useRealtimeInvalidate';
import { useAuthStore } from '../../store/authStore';

const SIDEBAR_KEY = 'pm-sidebar-collapsed';

/**
 * The authenticated application shell.
 */
export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === 'true';
    } catch (error) {
      return false;
    }
  });
  const location = useLocation();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);

  // Invalidate cached queries whenever a realtime event arrives.
  const { connected } = useRealtimeInvalidate({ enabled: true });

  // Unread notification count for the sidebar and topbar badges.
  const { data: notificationData } = useQuery({
    queryKey: ['notifications', 'count'],
    queryFn: async () => {
      const { data } = await api.get('/notifications', { params: { perPage: 1 } });
      return data.data?.unreadCount ?? 0;
    },
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const unreadCount = notificationData ?? 0;

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Persist the collapsed state.
  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, String(collapsed));
    } catch (error) {
      /* ignore */
    }
  }, [collapsed]);

  // Refresh the unread count when a new notification arrives over the socket.
  // The realtime invalidator already refetches `['notifications']` queries, so we
  // only need to pull the count query here - and we must avoid invalidating a
  // key that would match the query that triggered it, or we loop forever.
  useEffect(() => {
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'queryUpdated' && event.type !== 'queryAdded') return;
      const key = event.query?.queryKey;
      if (!Array.isArray(key) || key[0] !== 'notifications') return;
      // Only react to the list query, never to the count query itself.
      if (key.length > 1 && key[1] === 'count') return;
      queryClient.invalidateQueries({ queryKey: ['notifications', 'count'], exact: true });
    });
    return () => unsubscribe();
  }, [queryClient]);

  // Keyboard shortcut Ctrl+K / Cmd+K to open Command Palette
  useEffect(() => {
    const handleKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="flex h-full bg-slate-50 dark:bg-slate-950">
      <Sidebar
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((value) => !value)}
        unreadCount={unreadCount}
      />

      <div
        className={`flex min-w-0 flex-1 flex-col transition-[padding] duration-300 ${
          collapsed ? 'lg:pl-[76px]' : 'lg:pl-64'
        }`}
      >
        <Topbar
          onMenuClick={() => setMobileOpen(true)}
          unreadCount={unreadCount}
          realtimeConnected={connected}
          onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        />

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1600px] p-4 sm:p-6">
            <Outlet context={{ user, realtimeConnected: connected }} />
          </div>
        </main>
      </div>

      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
      />
    </div>
  );
}
