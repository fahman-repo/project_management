import { useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSocket } from './useSocket';

/**
 * Map a realtime event to the query keys that must be invalidated.
 * Keeping this in one place means every page reacts consistently.
 */
const EVENT_INVALIDATIONS = {
  'task:created': [['tasks'], ['dashboard'], ['projects']],
  'task:updated': [['tasks'], ['dashboard'], ['projects'], ['task']],
  'task:deleted': [['tasks'], ['dashboard'], ['projects'], ['task']],
  'task:moved': [['tasks'], ['board'], ['dashboard'], ['projects']],
  'task:assigned': [['tasks'], ['dashboard'], ['notifications']],
  'task:commented': [['task']],
  'task:attachment_added': [['task']],
  'task:dependency_added': [['task']],
  'task:dependency_removed': [['task']],
  'project:created': [['projects'], ['dashboard']],
  'project:updated': [['projects'], ['dashboard'], ['project']],
  'project:progress': [['projects'], ['dashboard'], ['project']],
  'project:deleted': [['projects'], ['dashboard']],
  'project:member_added': [['project'], ['projects']],
  'project:member_removed': [['project'], ['projects']],
  'milestone:created': [['milestones'], ['project']],
  'milestone:updated': [['milestones'], ['project']],
  'milestone:deleted': [['milestones'], ['project']],
  'activity:new': [['activities'], ['dashboard']],
  'notification:new': [['notifications']],
};

/**
 * Invalidate TanStack Query caches whenever a realtime event arrives.
 *
 * @param {object} [options]
 * @param {boolean} [options.enabled] subscribe only when true
 * @param {string[]} [options.events] restrict to specific events
 * @returns {{connected:boolean}}
 */
export function useRealtimeInvalidate(options = {}) {
  const { enabled = true, events } = options;
  const queryClient = useQueryClient();
  const invalidationsRef = useRef(EVENT_INVALIDATIONS);

  const eventList = events || Object.keys(invalidationsRef.current);

  const { connected } = useSocket(eventList, (event) => {
    if (!enabled) return;
    const keys = invalidationsRef.current[event];
    if (!keys) return;

    for (const key of keys) {
      queryClient.invalidateQueries({ queryKey: key });
    }
  });

  return { connected };
}
