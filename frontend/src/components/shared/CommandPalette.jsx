import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Calendar,
  CheckSquare,
  FileText,
  Folder,
  Kanban,
  LayoutDashboard,
  Moon,
  Search,
  Sun,
  Users,
  Bell,
  Activity,
  User,
  ArrowRight,
  Milestone,
  X,
} from 'lucide-react';
import { searchApi } from '../../api';
import { useDebounce } from '../../hooks/useDebounce';
import { useThemeStore } from '../../store/themeStore';
import { Avatar } from '../ui/Avatar';
import { TaskStatusBadge, PriorityBadge } from './Badges';
import { cn } from '../../utils/cn';

const STATIC_ACTIONS = [
  { id: 'nav-dash', label: 'Buka Dashboard', icon: LayoutDashboard, path: '/dashboard', group: 'Navigasi' },
  { id: 'nav-proj', label: 'Buka Projects', icon: Folder, path: '/projects', group: 'Navigasi' },
  { id: 'nav-tasks', label: 'Buka Tasks', icon: CheckSquare, path: '/tasks', group: 'Navigasi' },
  { id: 'nav-kanban', label: 'Buka Kanban Board', icon: Kanban, path: '/kanban', group: 'Navigasi' },
  { id: 'nav-gantt', label: 'Buka Gantt Chart', icon: Calendar, path: '/gantt', group: 'Navigasi' },
  { id: 'nav-cal', label: 'Buka Kalender', icon: Calendar, path: '/calendar', group: 'Navigasi' },
  { id: 'nav-reports', label: 'Buka Reports', icon: FileText, path: '/reports', group: 'Navigasi' },
  { id: 'nav-team', label: 'Buka Tim', icon: Users, path: '/team', group: 'Navigasi' },
  { id: 'nav-notif', label: 'Buka Notifikasi', icon: Bell, path: '/notifications', group: 'Navigasi' },
  { id: 'nav-act', label: 'Buka Activity Log', icon: Activity, path: '/activity', group: 'Navigasi' },
  { id: 'nav-prof', label: 'Buka Profil Saya', icon: User, path: '/profile', group: 'Navigasi' },
  { id: 'act-theme', label: 'Ganti Tema (Gelap / Terang)', icon: Sun, action: 'toggle-theme', group: 'Aksi' },
];

/**
 * Command Palette (Ctrl+K) for global search across projects, tasks, milestones, and members.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 */
export function CommandPalette({ open, onClose }) {
  const navigate = useNavigate();
  const { toggle, resolvedTheme } = useThemeStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);

  const debouncedSearch = useDebounce(searchTerm.trim(), 200);

  // Focus input whenever opened
  useEffect(() => {
    if (open) {
      setSearchTerm('');
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Query search API
  const { data, isLoading } = useQuery({
    queryKey: ['global-search', debouncedSearch],
    queryFn: () => searchApi.global({ q: debouncedSearch, limit: 5 }),
    enabled: open && Boolean(debouncedSearch),
    staleTime: 10 * 1000,
  });

  const projects = data?.projects ?? [];
  const tasks = data?.tasks ?? [];
  const milestones = data?.milestones ?? [];
  const users = data?.users ?? [];

  // Flatten items for keyboard navigation
  const flatItems = useMemo(() => {
    const list = [];

    if (!debouncedSearch) {
      // Default quick actions
      STATIC_ACTIONS.forEach((action) => {
        list.push({ ...action, type: 'action' });
      });
      return list;
    }

    // Filter static actions matching query
    const q = debouncedSearch.toLowerCase();
    STATIC_ACTIONS.forEach((action) => {
      if (action.label.toLowerCase().includes(q)) {
        list.push({ ...action, type: 'action' });
      }
    });

    // Add projects
    projects.forEach((p) => {
      list.push({
        type: 'project',
        id: `proj-${p.id}`,
        title: p.name,
        subtitle: p.code,
        color: p.color,
        path: `/projects/${p.id}`,
        item: p,
      });
    });

    // Add tasks
    tasks.forEach((t) => {
      list.push({
        type: 'task',
        id: `task-${t.id}`,
        title: t.title,
        subtitle: `${t.project_code} • ${t.project_name}`,
        path: `/tasks?task=${t.id}`,
        item: t,
      });
    });

    // Add milestones
    milestones.forEach((m) => {
      list.push({
        type: 'milestone',
        id: `mile-${m.id}`,
        title: m.name,
        subtitle: m.project_name ? `${m.project_code} • ${m.project_name}` : 'Milestone',
        path: `/projects/${m.project_id}?tab=milestones&milestone=${m.id}`,
        item: m,
      });
    });

    // Add users
    users.forEach((u) => {
      list.push({
        type: 'user',
        id: `user-${u.id}`,
        title: u.name,
        subtitle: u.job_title || u.email,
        path: `/team?search=${encodeURIComponent(u.name)}`,
        item: u,
      });
    });

    return list;
  }, [debouncedSearch, projects, tasks, milestones, users]);

  // Adjust active index within bounds
  useEffect(() => {
    if (activeIndex >= flatItems.length) {
      setActiveIndex(0);
    }
  }, [flatItems.length, activeIndex]);

  const selectItem = (item) => {
    onClose();
    if (item.action === 'toggle-theme') {
      toggle();
      return;
    }
    if (item.path) {
      navigate(item.path);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose();
      return;
    }
    if (!flatItems.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % flatItems.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev - 1 + flatItems.length) % flatItems.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (flatItems[activeIndex]) {
        selectItem(flatItems[activeIndex]);
      }
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16 sm:pt-24">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Dialog */}
      <div
        className="relative z-10 w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl transition-all dark:border-slate-800 dark:bg-slate-900"
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Bar */}
        <div className="flex items-center border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <Search className="h-5 w-5 shrink-0 text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cari task, project, milestone, atau anggota..."
            className="ml-3 flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none dark:text-white"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="mr-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <kbd className="hidden rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 sm:inline-block dark:bg-slate-800 dark:text-slate-400">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-96 overflow-y-auto p-2">
          {isLoading && (
            <div className="flex items-center justify-center py-8 text-xs text-slate-400">
              Mencari...
            </div>
          )}

          {!isLoading && debouncedSearch && flatItems.length === 0 && (
            <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
              Tidak ditemukan hasil untuk <span className="font-semibold text-slate-800 dark:text-slate-200">"{debouncedSearch}"</span>
            </div>
          )}

          {!isLoading && flatItems.length > 0 && (
            <ul className="space-y-1">
              {flatItems.map((item, index) => {
                const isSelected = index === activeIndex;

                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => selectItem(item)}
                      onMouseEnter={() => setActiveIndex(index)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
                        isSelected
                          ? 'bg-brand-50 text-brand-900 dark:bg-brand-500/15 dark:text-brand-100'
                          : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800/50'
                      )}
                    >
                      {/* Icon / Avatar based on item type */}
                      {item.type === 'action' && (
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          <item.icon className="h-4 w-4" />
                        </span>
                      )}

                      {item.type === 'project' && (
                        <span
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white"
                          style={{ backgroundColor: item.color || '#4f46e5' }}
                        >
                          <Folder className="h-4 w-4" />
                        </span>
                      )}

                      {item.type === 'task' && (
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400">
                          <CheckSquare className="h-4 w-4" />
                        </span>
                      )}

                      {item.type === 'milestone' && (
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
                          <Milestone className="h-4 w-4" />
                        </span>
                      )}

                      {item.type === 'user' && (
                        <Avatar src={item.item.avatar} name={item.item.name} size="sm" />
                      )}

                      {/* Content */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">
                            {item.title || item.label}
                          </span>
                          {item.type === 'task' && item.item?.status && (
                            <TaskStatusBadge status={item.item.status} size="sm" />
                          )}
                          {item.type === 'task' && item.item?.priority && (
                            <PriorityBadge priority={item.item.priority} size="sm" />
                          )}
                        </div>
                        {item.subtitle && (
                          <p className="truncate text-xs text-slate-400 dark:text-slate-500">
                            {item.subtitle}
                          </p>
                        )}
                      </div>

                      {/* Right indicator */}
                      <span className="shrink-0 text-xs text-slate-400">
                        {item.type === 'project' && 'Proyek'}
                        {item.type === 'task' && 'Task'}
                        {item.type === 'milestone' && 'Milestone'}
                        {item.type === 'user' && 'Anggota'}
                        {item.type === 'action' && <ArrowRight className="h-3.5 w-3.5 opacity-60" />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-2 text-[11px] text-slate-400 dark:border-slate-800 dark:bg-slate-950/50">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="rounded bg-white px-1.5 py-0.5 font-semibold text-slate-500 shadow-sm dark:bg-slate-800 dark:text-slate-300">
                &uarr;&darr;
              </kbd>{' '}
              Navigasi
            </span>
            <span>
              <kbd className="rounded bg-white px-1.5 py-0.5 font-semibold text-slate-500 shadow-sm dark:bg-slate-800 dark:text-slate-300">
                &crarr;
              </kbd>{' '}
              Buka
            </span>
          </div>
          <span>Pencarian Global ProjectFlow</span>
        </div>
      </div>
    </div>
  );
}

export default CommandPalette;

