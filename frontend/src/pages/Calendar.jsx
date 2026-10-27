import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Diamond,
  ExternalLink,
  Flag,
  ListTodo,
} from 'lucide-react';
import { calendarApi } from '../api';
import { projectApi } from '../api/project.api';
import { getErrorMessage } from '../api/client';
import { PageHeader } from '../components/shared/StatCard';
import { TaskStatusBadge, PriorityBadge } from '../components/shared/Badges';
import { Button, IconButton } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Select } from '../components/ui/Input';
import { Modal, Drawer } from '../components/ui/Modal';
import { SegmentedControl } from '../components/ui/Tabs';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/Feedback';
import { Avatar } from '../components/ui/Avatar';
import { formatDate } from '../utils/formatters';
import { taskLink, projectLink } from '../utils/links';
import { cn } from '../utils/cn';

const DAY_HEADERS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const MONTH_FORMAT = 'MMMM yyyy';
const MAX_CHIPS = 3;

/**
 * Parse an event date into a Date, tolerating missing values.
 * @param {any} value
 * @returns {Date|null}
 */
function eventDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  try {
    return parseISO(String(value));
  } catch (error) {
    return null;
  }
}

/**
 * Calendar page - custom month grid plus agenda list.
 */
export default function Calendar() {
  const navigate = useNavigate();

  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [view, setView] = useState('month');
  const [projectId, setProjectId] = useState('');
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);

  // Projects for the filter dropdown.
  const { data: projectList } = useQuery({
    queryKey: ['projects', 'list', 'options'],
    queryFn: () => projectApi.list({ perPage: 100, sort: 'name', direction: 'asc' }),
    staleTime: 5 * 60 * 1000,
  });

  const projects = projectList?.data || [];
  const projectOptions = projects.map((project) => ({
    value: String(project.id),
    label: `${project.code ? `${project.code} - ` : ''}${project.name}`,
  }));

  // The visible month grid, including the leading/trailing days.
  const gridDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  // Range sent to the API: the whole grid for month view, a wider window for agenda.
  const range = useMemo(() => {
    if (view === 'agenda') {
      const start = startOfMonth(currentMonth);
      const end = endOfMonth(currentMonth);
      return { from: format(start, 'yyyy-MM-dd'), to: format(end, 'yyyy-MM-dd') };
    }
    const start = gridDays[0];
    const end = gridDays[gridDays.length - 1];
    return { from: format(start, 'yyyy-MM-dd'), to: format(end, 'yyyy-MM-dd') };
  }, [view, currentMonth, gridDays]);

  const eventsQuery = useQuery({
    queryKey: ['calendar', 'events', range.from, range.to, projectId || 'all'],
    queryFn: () =>
      calendarApi.events({
        from: range.from,
        to: range.to,
        project_id: projectId || undefined,
      }),
  });

  const events = useMemo(() => {
    const raw = eventsQuery.data?.events || eventsQuery.data || [];
    return Array.isArray(raw) ? raw : [];
  }, [eventsQuery.data]);

  // Index events by calendar day for quick lookups.
  const eventsByDay = useMemo(() => {
    const map = new Map();
    for (const event of events) {
      const date = eventDate(event.date);
      if (!date) continue;
      const key = format(date, 'yyyy-MM-dd');
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(event);
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        const typeOrder = (item) => (item.type === 'milestone' ? 0 : 1);
        return typeOrder(a) - typeOrder(b) || String(a.title).localeCompare(String(b.title));
      });
    }
    return map;
  }, [events]);

  // Agenda view: group the month events by date.
  const agendaGroups = useMemo(() => {
    const groups = [];
    for (const [key, list] of eventsByDay.entries()) {
      const date = parseISO(key);
      groups.push({ key, date, events: list });
    }
    groups.sort((a, b) => a.date.getTime() - b.date.getTime());
    return groups;
  }, [eventsByDay]);

  const selectedDayEvents = selectedDay ? eventsByDay.get(format(selectedDay, 'yyyy-MM-dd')) || [] : [];

  const goToToday = () => setCurrentMonth(startOfMonth(new Date()));

  const openEvent = (event) => {
    setSelectedDay(eventDate(event.date));
    setSelectedEvent(event);
  };

  const openEventLink = (event) => {
    if (!event) {
      navigate('/tasks');
      return;
    }

    if (event.type === 'milestone') {
      const milestoneId = event.milestoneId ?? event.id?.replace(/^milestone-/, '');
      navigate(
        projectLink(event.projectId, {
          tab: 'milestones',
          milestoneId,
        })
      );
      return;
    }

    if (event.type === 'task') {
      const taskId = event.taskId ?? event.id?.replace(/^task-/, '');
      navigate(taskLink(taskId));
      return;
    }

    if (event.projectId) {
      navigate(projectLink(event.projectId));
      return;
    }

    navigate('/tasks');
  };

  const renderChip = (event, { compact = false } = {}) => {
    const color = event.color || event.projectColor || '#4f46e5';
    const isMilestone = event.type === 'milestone';

    return (
      <button
        key={`${event.type}-${event.id}`}
        type="button"
        onClick={(clickEvent) => {
          clickEvent.stopPropagation();
          openEvent(event);
        }}
        title={event.title}
        className={cn(
          'flex w-full items-center gap-1 rounded px-1.5 text-left transition-opacity hover:opacity-80',
          compact ? 'py-0.5 text-[10px]' : 'py-1 text-[11px]'
        )}
        style={{ backgroundColor: `${color}1f`, color }}
      >
        {isMilestone ? (
          <Diamond className="h-2.5 w-2.5 shrink-0" fill={color} />
        ) : (
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: color }}
          />
        )}
        <span className="truncate font-medium">{event.title}</span>
      </button>
    );
  };

  return (
    <div>
      <PageHeader title="Calendar" description="Jadwal task, milestone dan tenggat setiap project" />

      <Card className="mb-5">
        <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            label="Project"
            options={projectOptions}
            placeholder="Semua Project"
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
          />
          <div className="flex items-end">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Menampilkan agenda untuk{' '}
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {format(currentMonth, MONTH_FORMAT, { locale: idLocale })}
              </span>
            </p>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={
            <span className="text-base font-semibold capitalize">
              {format(currentMonth, MONTH_FORMAT, { locale: idLocale })}
            </span>
          }
          action={
            <div className="flex flex-wrap items-center gap-2">
              <IconButton label="Bulan sebelumnya" onClick={() => setCurrentMonth((value) => subMonths(value, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </IconButton>
              <Button variant="secondary" size="sm" onClick={goToToday}>
                Hari Ini
              </Button>
              <IconButton label="Bulan berikutnya" onClick={() => setCurrentMonth((value) => addMonths(value, 1))}>
                <ChevronRight className="h-4 w-4" />
              </IconButton>
              <SegmentedControl
                value={view}
                onChange={setView}
                options={[
                  { value: 'month', label: 'Bulan', icon: <CalendarDays className="h-3.5 w-3.5" /> },
                  { value: 'agenda', label: 'Agenda', icon: <ListTodo className="h-3.5 w-3.5" /> },
                ]}
              />
            </div>
          }
        />

        <CardBody className="space-y-4">
          {eventsQuery.isLoading ? (
            <LoadingState label="Memuat agenda..." />
          ) : eventsQuery.isError ? (
            <ErrorState
              description={getErrorMessage(eventsQuery.error)}
              onRetry={() => eventsQuery.refetch()}
            />
          ) : view === 'month' ? (
            <MonthGrid
              days={gridDays}
              currentMonth={currentMonth}
              eventsByDay={eventsByDay}
              onSelectDay={setSelectedDay}
              renderChip={renderChip}
            />
          ) : (
            <AgendaList
              groups={agendaGroups}
              onSelectDay={setSelectedDay}
              renderChip={renderChip}
            />
          )}

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-100 pt-4 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-brand-600" />
              Task - warna mengikuti project
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Diamond className="h-3 w-3 fill-brand-600 text-brand-600" />
              Milestone
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-rose-500" />
              Hari ini
            </span>
          </div>
        </CardBody>
      </Card>

      {/* Detail drawer for the selected day */}
      <Drawer
        open={Boolean(selectedDay) && !selectedEvent}
        onClose={() => setSelectedDay(null)}
        title={selectedDay ? formatDate(selectedDay, 'EEEE, dd MMMM yyyy') : ''}
        description={`${selectedDayEvents.length} agenda pada tanggal ini`}
      >
        {selectedDayEvents.length ? (
          <ul className="space-y-2">
            {selectedDayEvents.map((event) => (
              <li key={`${event.type}-${event.id}`}>
                <button
                  type="button"
                  onClick={() => setSelectedEvent(event)}
                  className="flex w-full items-start gap-3 rounded-xl border border-slate-200 p-3 text-left transition-colors hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  <span
                    className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                    style={{
                      backgroundColor: `${event.color || event.projectColor || '#4f46e5'}1f`,
                      color: event.color || event.projectColor || '#4f46e5',
                    }}
                  >
                    {event.type === 'milestone' ? (
                      <Flag className="h-4 w-4" />
                    ) : (
                      <ListTodo className="h-4 w-4" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900 dark:text-white">
                      {event.title}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">
                      {event.projectName || '-'}
                      {event.assigneeName ? ` - ${event.assigneeName}` : ''}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={CalendarDays}
            title="Tidak ada agenda"
            description="Belum ada task atau milestone pada tanggal ini."
          />
        )}
      </Drawer>

      {/* Event detail modal */}
      <Modal
        open={Boolean(selectedEvent)}
        onClose={() => setSelectedEvent(null)}
        title={selectedEvent?.title}
        description={selectedEvent?.projectName}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSelectedEvent(null)}>
              Tutup
            </Button>
            <Button
              leftIcon={<ExternalLink className="h-4 w-4" />}
              onClick={() => {
                openEventLink(selectedEvent);
                setSelectedEvent(null);
              }}
            >
              Buka
            </Button>
          </>
        }
      >
        {selectedEvent && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                style={{
                  backgroundColor: `${selectedEvent.color || selectedEvent.projectColor || '#4f46e5'}1f`,
                  color: selectedEvent.color || selectedEvent.projectColor || '#4f46e5',
                }}
              >
                {selectedEvent.type === 'milestone' ? (
                  <Flag className="h-3 w-3" />
                ) : (
                  <ListTodo className="h-3 w-3" />
                )}
                {selectedEvent.type === 'milestone' ? 'Milestone' : 'Task'}
              </span>
              {selectedEvent.status && <TaskStatusBadge status={selectedEvent.status} size="sm" />}
              {selectedEvent.priority && <PriorityBadge priority={selectedEvent.priority} size="sm" />}
            </div>

            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-slate-500 dark:text-slate-400">Tanggal</dt>
                <dd className="mt-0.5 text-sm text-slate-900 dark:text-white">
                  {formatDate(selectedEvent.date, 'EEEE, dd MMMM yyyy')}
                </dd>
              </div>
              {selectedEvent.endDate && (
                <div>
                  <dt className="text-xs text-slate-500 dark:text-slate-400">Berakhir</dt>
                  <dd className="mt-0.5 text-sm text-slate-900 dark:text-white">
                    {formatDate(selectedEvent.endDate, 'dd MMMM yyyy')}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-slate-500 dark:text-slate-400">Project</dt>
                <dd className="mt-0.5 text-sm text-slate-900 dark:text-white">
                  {selectedEvent.projectName || '-'}
                </dd>
              </div>
              {selectedEvent.assigneeName && (
                <div>
                  <dt className="text-xs text-slate-500 dark:text-slate-400">Ditugaskan ke</dt>
                  <dd className="mt-0.5 flex items-center gap-2 text-sm text-slate-900 dark:text-white">
                    <Avatar name={selectedEvent.assigneeName} size="xs" />
                    {selectedEvent.assigneeName}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        )}
      </Modal>
    </div>
  );
}

/**
 * Month grid renderer.
 *
 * @param {object} props
 * @param {Date[]} props.days
 * @param {Date} props.currentMonth
 * @param {Map<string, object[]>} props.eventsByDay
 * @param {(day:Date) => void} props.onSelectDay
 * @param {(event:object, options:object) => any} props.renderChip
 */
function MonthGrid({ days, currentMonth, eventsByDay, onSelectDay, renderChip }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40">
        {DAY_HEADERS.map((day) => (
          <div
            key={day}
            className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Days */}
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const key = format(day, 'yyyy-MM-dd');
          const dayEvents = eventsByDay.get(key) || [];
          const outside = !isSameMonth(day, currentMonth);
          const today = isToday(day);
          const visible = dayEvents.slice(0, MAX_CHIPS);
          const overflow = dayEvents.length - visible.length;

          return (
            <div
              key={key}
              className={cn(
                'group flex min-h-[92px] flex-col items-stretch gap-1 border-b border-r border-slate-100 p-1.5 text-left transition-colors hover:bg-slate-50 sm:min-h-[116px]',
                outside && 'bg-slate-50/60 dark:bg-slate-950/30'
              )}
            >
              <button
                type="button"
                onClick={() => onSelectDay(day)}
                className="flex self-start rounded-full focus-ring"
                aria-label={`Lihat agenda ${format(day, 'dd MMMM yyyy')}`}
              >
                <span
                  className={cn(
                    'flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums',
                    today
                      ? 'bg-rose-500 text-white'
                      : outside
                        ? 'text-slate-400 dark:text-slate-600'
                        : 'text-slate-700 dark:text-slate-200'
                  )}
                >
                  {format(day, 'd')}
                </span>
              </button>

              <span className="flex flex-col gap-0.5">
                {visible.map((event) => renderChip(event, { compact: true }))}
                {overflow > 0 && (
                  <span className="px-1 text-[10px] font-medium text-slate-500 dark:text-slate-400">
                    +{overflow} lagi
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Agenda view renderer - a vertical list grouped by date.
 *
 * @param {object} props
 * @param {Array<{key:string,date:Date,events:object[]}>} props.groups
 * @param {(day:Date) => void} props.onSelectDay
 * @param {(event:object, options:object) => any} props.renderChip
 */
function AgendaList({ groups, onSelectDay, renderChip }) {
  if (!groups.length) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="Belum ada agenda"
        description="Tidak ada task atau milestone pada bulan ini."
      />
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.key}>
          <button
            type="button"
            onClick={() => onSelectDay(group.date)}
            className="mb-2 flex items-center gap-2 text-left"
          >
            <span
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold tabular-nums',
                isToday(group.date)
                  ? 'bg-rose-500 text-white'
                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
              )}
            >
              {format(group.date, 'd')}
            </span>
            <span className="text-sm font-semibold capitalize text-slate-900 dark:text-white">
              {format(group.date, 'EEEE, dd MMMM yyyy', { locale: idLocale })}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              ({group.events.length})
            </span>
          </button>

          <ul className="ml-10 space-y-1.5 border-l border-slate-200 pl-3 dark:border-slate-800">
            {group.events.map((event) => (
              <li key={`${event.type}-${event.id}`} className="w-full">
                {renderChip(event)}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
