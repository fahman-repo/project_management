import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  FolderKanban,
  ListTodo,
  KanbanSquare,
  Calendar,
  CalendarDays,
  BarChart3,
  Users,
  Bell,
  History,
  Settings,
  X,
  Zap,
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { useAuthStore } from '../../store/authStore';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/tasks', label: 'Tasks', icon: ListTodo },
  { to: '/kanban', label: 'Kanban Board', icon: KanbanSquare },
  { to: '/gantt', label: 'Gantt Timeline', icon: Calendar },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
];

const SECONDARY_ITEMS = [
  { to: '/team', label: 'Team', icon: Users, adminOnly: false },
  { to: '/notifications', label: 'Notifications', icon: Bell, badge: true },
  { to: '/activity', label: 'Activity Log', icon: History },
];

const SETTINGS_ITEMS = [
  { to: '/settings/users', label: 'User Management', icon: Settings, adminOnly: true },
];

/**
 * A single navigation entry.
 */
function NavItem({ item, onNavigate, badgeCount }) {
  const Icon = item.icon;

  return (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          isActive
            ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            className={cn(
              'h-[18px] w-[18px] shrink-0 transition-colors',
              isActive
                ? 'text-brand-600 dark:text-brand-400'
                : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300'
            )}
          />
          <span className="flex-1 truncate">{item.label}</span>
          {item.badge && badgeCount > 0 && (
            <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-semibold text-white">
              {badgeCount > 99 ? '99+' : badgeCount}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

/**
 * Application sidebar - collapsible on desktop, overlay drawer on mobile.
 */
export function Sidebar({ open, onClose, collapsed, onToggleCollapse, unreadCount = 0 }) {
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === 'admin';

  const visibleSecondary = SECONDARY_ITEMS.filter((item) => !item.adminOnly || isAdmin);
  const visibleSettings = SETTINGS_ITEMS.filter((item) => !item.adminOnly || isAdmin);

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm lg:hidden animate-fade-in"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col border-r border-slate-200 bg-white transition-all duration-300 dark:border-slate-800 dark:bg-slate-900',
          'lg:translate-x-0',
          open ? 'translate-x-0 shadow-dropdown' : '-translate-x-full',
          collapsed ? 'lg:w-[76px]' : 'lg:w-64',
          'w-64'
        )}
      >
        {/* Brand */}
        <div
          className={cn(
            'flex h-16 shrink-0 items-center gap-3 border-b border-slate-100 px-4 dark:border-slate-800',
            collapsed && 'lg:justify-center lg:px-0'
          )}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 shadow-sm">
            <Zap className="h-5 w-5 text-white" />
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-slate-900 dark:text-white">ProjectFlow</p>
              <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                Project Management
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 lg:hidden dark:hover:bg-slate-800"
            aria-label="Tutup menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
          <div className="space-y-1">
            {NAV_ITEMS.map((item) => (
              <NavItem key={item.to} item={item} onNavigate={onClose} />
            ))}
          </div>

          <div className="space-y-1">
            {!collapsed && (
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Lainnya
              </p>
            )}
            {collapsed && <div className="mx-2 border-t border-slate-100 dark:border-slate-800" />}
            {visibleSecondary.map((item) => (
              <NavItem
                key={item.to}
                item={item}
                onNavigate={onClose}
                badgeCount={item.badge ? unreadCount : 0}
              />
            ))}
          </div>

          {visibleSettings.length > 0 && (
            <div className="space-y-1">
              {!collapsed && (
                <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Pengaturan
                </p>
              )}
              {collapsed && <div className="mx-2 border-t border-slate-100 dark:border-slate-800" />}
              {visibleSettings.map((item) => (
                <NavItem key={item.to} item={item} onNavigate={onClose} />
              ))}
            </div>
          )}
        </nav>

        {/* Collapse toggle (desktop only) */}
        <div className="hidden shrink-0 border-t border-slate-100 p-3 lg:block dark:border-slate-800">
          <button
            type="button"
            onClick={onToggleCollapse}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200',
              collapsed && 'justify-center px-0'
            )}
            aria-label={collapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'}
          >
            <svg
              className={cn('h-4 w-4 transition-transform', collapsed && 'rotate-180')}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="m15 18-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {!collapsed && <span>Ciutkan</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
