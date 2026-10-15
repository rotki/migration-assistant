import { describe, expect, it } from 'vitest';
import { detectDateFormats, parseDate } from './dates';

const NOON_UTC = Date.UTC(2024, 2, 5, 12, 30, 15);

describe('parseDate', () => {
  it('reads epoch seconds and milliseconds', () => {
    expect(parseDate('1709641815', 'unix-s', 'UTC')).toBe(NOON_UTC);
    expect(parseDate('1709641815.25', 'unix-s', 'UTC')).toBe(NOON_UTC + 250);
    expect(parseDate('1709641815000', 'unix-ms', 'UTC')).toBe(NOON_UTC);
  });

  it('reads ISO 8601 with and without an offset', () => {
    expect(parseDate('2024-03-05T12:30:15Z', 'iso', 'Europe/Berlin')).toBe(NOON_UTC);
    expect(parseDate('2024-03-05 14:30:15+02:00', 'iso', 'UTC')).toBe(NOON_UTC);
    expect(parseDate('2024-03-05 12:30:15 UTC', 'iso', 'Asia/Tokyo')).toBe(NOON_UTC);
    expect(parseDate('2024-03-05T12:30:15.123', 'iso', 'UTC')).toBe(NOON_UTC + 123);
    expect(parseDate('2024-03-05 13:30:15', 'iso', 'Europe/Berlin')).toBe(NOON_UTC);
  });

  it('reads patterns as wall-clock time in the chosen zone', () => {
    expect(parseDate('05/03/2024 12:30:15', 'DD/MM/YYYY HH:mm:ss', 'UTC')).toBe(NOON_UTC);
    expect(parseDate('03/05/2024 12:30:15', 'MM/DD/YYYY HH:mm:ss', 'UTC')).toBe(NOON_UTC);
    expect(parseDate('3/5/2024 7:30:15 AM', 'M/D/YYYY h:mm:ss A', 'America/New_York')).toBe(NOON_UTC);
    expect(parseDate('Mar 5, 2024, 12:30 PM', 'MMM D, YYYY, h:mm A', 'UTC')).toBe(NOON_UTC - 15_000);
  });

  it('matches text in square brackets as written', () => {
    expect(parseDate('Mar 5, 2024 at 12:30 PM', 'MMM D, YYYY [at] h:mm A', 'UTC')).toBe(NOON_UTC - 15_000);
    expect(parseDate('Mar 5, 2024 at 12:30 PM', 'MMM D, YYYY at h:mm A', 'UTC')).toBeUndefined();
  });

  it('applies daylight saving time of the zone', () => {
    expect(parseDate('2024-07-01 14:00:00', 'iso', 'Europe/Berlin')).toBe(Date.UTC(2024, 6, 1, 12));
    expect(parseDate('2024-01-01 13:00:00', 'iso', 'Europe/Berlin')).toBe(Date.UTC(2024, 0, 1, 12));
  });

  it('rejects values that do not match or are not real dates', () => {
    expect(parseDate('2024-02-30', 'iso', 'UTC')).toBeUndefined();
    expect(parseDate('13/13/2024 10:00', 'DD/MM/YYYY HH:mm', 'UTC')).toBeUndefined();
    expect(parseDate('yesterday', 'iso', 'UTC')).toBeUndefined();
    expect(parseDate('12.5', 'unix-ms', 'UTC')).toBeUndefined();
    expect(parseDate('13:00 PM', 'h:mm A', 'UTC')).toBeUndefined();
  });
});

describe('detectDateFormats', () => {
  it('finds ISO timestamps', () => {
    expect(detectDateFormats(['2024-03-05T12:30:15Z', '2024-03-06 08:00:00'], 'UTC')).toEqual(['iso']);
  });

  it('tells epoch seconds from milliseconds', () => {
    expect(detectDateFormats(['1709641815'], 'UTC')).toEqual(['unix-s']);
    expect(detectDateFormats(['1709641815000'], 'UTC')).toEqual(['unix-ms']);
  });

  it('settles day-first when a day is above 12', () => {
    expect(detectDateFormats(['05/03/2024 12:30:15', '25/03/2024 08:00:00'], 'UTC'))
      .toEqual(['DD/MM/YYYY HH:mm:ss']);
  });

  it('reports both orders when the samples cannot tell them apart', () => {
    expect(detectDateFormats(['05/03/2024 12:30:15'], 'UTC')).toEqual(['DD/MM/YYYY HH:mm:ss', 'MM/DD/YYYY HH:mm:ss']);
  });

  it('looks past a stray value that is not a date', () => {
    expect(detectDateFormats(['2024-03-05 12:30:15', '2024-03-06 08:01:02', '2024-03-07 23:59:59', 'not a date'], 'UTC')).toEqual(['iso']);
  });

  it('finds nothing for text that is not a date', () => {
    expect(detectDateFormats(['BTC', 'ETH'], 'UTC')).toEqual([]);
  });
});
