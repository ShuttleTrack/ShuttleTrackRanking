import { describe, it, expect } from 'vitest';
import { COMMON_TIMEZONES, allTimezones, searchTimezones, toTimezoneOption, utcOffsetLabel } from './timezones';
import { isValidTimeZone } from './gameDay/clock';

const SUMMER = new Date('2026-07-01T12:00:00Z');
const WINTER = new Date('2026-01-15T12:00:00Z');
const options = allTimezones().map((z) => toTimezoneOption(z, SUMMER));
const zonesFor = (q: string) => searchTimezones(q, options).map((o) => o.zone);

describe('allTimezones', () => {
  it('is sorted, de-duplicated, includes UTC and the common zones, and every entry is valid', () => {
    const zones = allTimezones();
    expect(zones).toEqual([...zones].sort());
    expect(new Set(zones).size).toBe(zones.length);
    for (const zone of COMMON_TIMEZONES) expect(zones).toContain(zone);
    expect(zones.every((z) => isValidTimeZone(z))).toBe(true);
  });
});

describe('utcOffsetLabel', () => {
  it('reflects DST at the given instant', () => {
    expect(utcOffsetLabel('Europe/Amsterdam', SUMMER)).toBe('UTC+02:00');
    expect(utcOffsetLabel('Europe/Amsterdam', WINTER)).toBe('UTC+01:00');
    expect(utcOffsetLabel('Asia/Colombo', SUMMER)).toBe('UTC+05:30');
    expect(utcOffsetLabel('America/New_York', WINTER)).toBe('UTC-05:00');
    expect(utcOffsetLabel('UTC', SUMMER)).toBe('UTC+00:00');
  });
});

describe('toTimezoneOption', () => {
  it('splits a zone into a readable city and region', () => {
    expect(toTimezoneOption('America/Argentina/Buenos_Aires', SUMMER)).toMatchObject({
      city: 'Buenos Aires',
      region: 'America/Argentina',
    });
    expect(toTimezoneOption('UTC', SUMMER)).toMatchObject({ city: 'UTC', region: '' });
  });
});

describe('searchTimezones', () => {
  it('finds a zone by city, ranking a city-prefix match first', () => {
    expect(zonesFor('amster')[0]).toBe('Europe/Amsterdam');
    expect(zonesFor('colombo')[0]).toBe('Asia/Colombo');
  });

  it('matches every term, across region and city, ignoring case and underscores', () => {
    expect(zonesFor('europe ams')).toEqual(['Europe/Amsterdam']);
    expect(zonesFor('los angeles')).toContain('America/Los_Angeles');
  });

  it('finds zones by their UTC offset', () => {
    expect(zonesFor('+05:30')).toContain('Asia/Colombo');
    expect(zonesFor('+05:30')).not.toContain('Europe/Amsterdam');
  });

  it('returns nothing for a query that matches nothing, and caps long result lists', () => {
    expect(zonesFor('xyzzy')).toEqual([]);
    expect(searchTimezones('a', options, 10)).toHaveLength(10);
  });
});
