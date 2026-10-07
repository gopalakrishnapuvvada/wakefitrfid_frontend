/**
 * Utility functions for Indian Standard Time (IST - UTC+05:30) formatting and synchronization.
 */

/**
 * Converts any UTC, ISO, Date, or timestamp string into an IST formatted string: 'YYYY-MM-DD HH:mm:ss'.
 */
export function formatToIST(input?: string | Date | number | null): string {
  if (!input) return '';

  let d: Date;

  if (typeof input === 'number') {
    d = new Date(input);
  } else if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return '';

    // 1. If already formatted as 'YYYY-MM-DD HH:mm:ss' (space-separated naive IST string), return as is to prevent double conversion
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(trimmed)) {
      return trimmed.length === 16 ? `${trimmed}:00` : trimmed;
    }

    // 2. If it is just time 'HH:mm:ss', prepend today's IST date
    if (/^\d{2}:\d{2}:\d{2}$/.test(trimmed)) {
      const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());
      return `${today} ${trimmed}`;
    }

    // 3. If input is ISO string from backend with 'T' (e.g. '2026-10-07T12:07:45Z' or '2026-10-07T12:07:45')
    if (trimmed.includes('T')) {
      const withTz = trimmed.endsWith('Z') || trimmed.includes('+') || (trimmed.length > 19 && trimmed.lastIndexOf('-') > 10)
        ? trimmed
        : trimmed + 'Z';
      d = new Date(withTz);
    } else {
      d = new Date(trimmed);
    }
  } else {
    d = new Date(input);
  }

  if (isNaN(d.getTime())) return String(input);

  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(d);

  return formatted.replace(',', '').trim();
}

/**
 * Returns current timestamp in IST formatted as 'YYYY-MM-DD HH:mm:ss'.
 */
export function getCurrentIST(): string {
  return formatToIST(new Date());
}

