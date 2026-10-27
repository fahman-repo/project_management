import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, Search, Sun, Moon, LogOut, User, KeyRound, Bell, Radio } from 'lucide-react';
import { cn } from '../../utils/cn';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import { Avatar } from '../ui/Avatar';
import { IconButton } from '../ui/Button';
import { Dropdown, DropdownItem, DropdownLabel, DropdownSeparator } from '../ui/Dropdown';

const TITLES = {
  '/dashboard': 'Dashboard',
  '/projects': 'Projects',
  '/tasks': 'Tasks',
  '/kanban': 'Kanban Board',
  '/calendar': 'Calendar',
  '/reports': 'Reports',
  '/team': 'Team',
  '/notifications': 'Notifications',
  '/activity': 'Activity Log',
  '/profile': 'Profile',
  '/settings/users': 'User Management',
};

/**
 * Top application bar: mobile menu, breadcrumb, search, theme and profile.
 */
export function Topbar({ onMenuClick, unreadCount = 0, realtimeConnected = true }) {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const { theme, resolvedTheme, setTheme, toggle } = useThemeStore();

  const title = TITLES[location.pathname] || (location.pathname.startsWith('/projects/') ? 'Detail Project' : 'ProjectFlow');

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 sm:px-6">
      <IconButton label="Buka menu" onClick={onMenuClick} className="lg:hidden">
        <Menu className="h-5 w-5" />
      </IconButton>

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-semibold text-slate-900 dark:text-white sm:text-lg">
          {title}
        </h1>
      </div>

      {/* Realtime indicator */}
      <div
        className="hidden items-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-medium sm:flex dark:border-slate-700"
        title={
          realtimeConnected
            ? 'Terhubung - progress diperbarui secara real-time'
            : 'Terputus - data dimuat ulang secara berkala'
        }
      >
        <Radio
          className={cn(
            'h-3.5 w-3.5',
            realtimeConnected ? 'text-emerald-500' : 'text-slate-400'
          )}
        />
        <span className={realtimeConnected ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}>
          {realtimeConnected ? 'Live' : 'Offline'}
        </span>
      </div>

      {/* Global search */}
      <div className="relative hidden md:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          placeholder="Cari task, project..."
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              const value = event.currentTarget.value.trim();
              if (value) navigate(`/tasks?search=${encodeURIComponent(value)}`);
            }
          }}
          className="w-52 rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 transition-colors focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 lg:w-64 dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-200 dark:focus:bg-slate-900"
        />
      </div>

      {/* Theme toggle */}
      <IconButton
        label={resolvedTheme() === 'dark' ? 'Mode terang' : 'Mode gelap'}
        onClick={toggle}
      >
        {resolvedTheme() === 'dark' ? (
          <Sun className="h-[18px] w-[18px]" />
        ) : (
          <Moon className="h-[18px] w-[18px]" />
        )}
      </IconButton>

      {/* Notifications */}
      <Link
        to="/notifications"
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-ring dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        aria-label={`Notifikasi${unreadCount ? `, ${unreadCount} belum dibaca` : ''}`}
      >
        <Bell className="h-[18px] w-[18px]" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </Link>

      {/* Profile */}
      <Dropdown
        align="right"
        trigger={
          <button
            type="button"
            className="flex items-center gap-2.5 rounded-lg p-1 transition-colors hover:bg-slate-100 focus-ring dark:hover:bg-slate-800"
          >
            <Avatar src={user?.avatar} name={user?.name} size="md" />
            <span className="hidden text-left lg:block">
              <span className="block text-xs font-semibold text-slate-800 dark:text-slate-100">
                {user?.name}
              </span>
              <span className="block text-[11px] capitalize text-slate-500 dark:text-slate-400">
                {user?.role}
              </span>
            </span>
          </button>
        }
      >
        <div className="flex items-center gap-3 px-3.5 py-3">
          <Avatar src={user?.avatar} name={user?.name} size="lg" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{user?.name}</p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{user?.email}</p>
          </div>
        </div>
        <DropdownSeparator />
        <DropdownLabel>Akun</DropdownLabel>
        <DropdownItem icon={User} onClick={() => navigate('/profile')}>
          Profil Saya
        </DropdownItem>
        <DropdownItem icon={KeyRound} onClick={() => navigate('/profile?tab=password')}>
          Ganti Password
        </DropdownItem>
        <DropdownSeparator />
        <DropdownItem icon={LogOut} danger onClick={handleLogout}>
          Keluar
        </DropdownItem>
      </Dropdown>
    </header>
  );
}
