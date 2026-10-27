import { useEffect, useState } from 'react';

/**
 * Debounce a rapidly changing value.
 * @param {any} value
 * @param {number} [delay] milliseconds
 */
export function useDebounce(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
