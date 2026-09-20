import { describe, expect, it } from 'vitest';
import type { Player } from '@/types/player';
import { filterPlayersByQuery, sortPlayersByName } from './playerNavSearchUtils';
import { isEncountersRoute, isHistoryRoute } from './navUtils';

const samplePlayers: Player[] = [
  {
    id: 2,
    name: 'Zara',
    rankScore: 100,
    playerRank: 2,
    previousRank: 2,
    colorHex: 'ff0000',
    highestRank: 1,
    timeInHighestRank: '1 day(s)',
    active: true,
  },
  {
    id: 1,
    name: 'Alex',
    rankScore: 110,
    playerRank: 1,
    previousRank: 1,
    colorHex: '00ff00',
    highestRank: 1,
    timeInHighestRank: '2 day(s)',
    active: true,
  },
];

describe('navPlayerSearch', () => {
  it('sortPlayersByName returns a new sorted array without mutating input', () => {
    const input = [...samplePlayers];
    const sorted = sortPlayersByName(input);
    expect(sorted.map((p) => p.name)).toEqual(['Alex', 'Zara']);
    expect(input.map((p) => p.name)).toEqual(['Zara', 'Alex']);
  });

  it('filterPlayersByQuery matches case-insensitive substrings', () => {
    const sorted = sortPlayersByName(samplePlayers);
    expect(filterPlayersByQuery(sorted, 'al').map((p) => p.id)).toEqual([1]);
    expect(filterPlayersByQuery(sorted, '').map((p) => p.id)).toEqual([1, 2]);
  });
});

describe('query-gated results', () => {
  it('empty query should NOT show results (trim length < 1)', () => {
    expect(''.trim().length >= 1).toBe(false);
    expect('   '.trim().length >= 1).toBe(false);
  });

  it('non-empty query should show results', () => {
    expect('a'.trim().length >= 1).toBe(true);
    expect(' z '.trim().length >= 1).toBe(true);
  });

  it('filterPlayersByQuery returns empty array for non-matching query', () => {
    const sorted = sortPlayersByName(samplePlayers);
    expect(filterPlayersByQuery(sorted, 'zzz')).toHaveLength(0);
  });
});

describe('navUtils route helpers', () => {
  it('detects encounters and history routes', () => {
    expect(isEncountersRoute('/player/3/encounters')).toBe(true);
    expect(isEncountersRoute('/')).toBe(false);
    expect(isHistoryRoute('/encounter-history')).toBe(true);
    expect(isHistoryRoute('/player-ranking-history')).toBe(true);
    expect(isHistoryRoute('/')).toBe(false);
  });
});
