import { describe, it, expect } from 'vitest';
import {
  mobileCarouselChips,
  selectSquadScoreChips,
  squadChipsByWeight,
  squadScoreChipCopy,
} from './SquadScoreChips';
import type { SquadChip } from '@/types/rankings';

function chip(
  slug: string,
  name: string,
  playerRank: number,
  publicWeight = 0.5
): SquadChip {
  return { slug, name, playerRank, publicWeight };
}

describe('selectSquadScoreChips', () => {
  it('returns at most four chips in API order', () => {
    const squads = [
      chip('a', 'A', 1),
      chip('b', 'B', 2),
      chip('c', 'C', 3),
      chip('d', 'D', 4),
      chip('e', 'E', 5),
    ];
    expect(selectSquadScoreChips(squads)).toHaveLength(4);
    expect(selectSquadScoreChips(squads).map((s) => s.slug)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('mobileCarouselChips', () => {
  it('caps at four and orders by weight', () => {
    const chips = mobileCarouselChips([
      chip('a', 'A', 1, 0.2),
      chip('b', 'B', 2, 0.9),
      chip('c', 'C', 3, 0.5),
      chip('d', 'D', 4, 0.8),
      chip('e', 'E', 5, 0.7),
    ]);
    expect(chips.map((s) => s.slug)).toEqual(['b', 'd', 'e', 'c']);
  });
});

describe('squadChipsByWeight', () => {
  it('sorts by public weight descending, then rank, then name', () => {
    const sorted = squadChipsByWeight([
      chip('low', 'Low', 1, 0.3),
      chip('high', 'High', 4, 0.9),
      chip('mid', 'Mid', 2, 0.5),
    ]);
    expect(sorted.map((s) => s.slug)).toEqual(['high', 'mid', 'low']);
  });
});

describe('squadScoreChipCopy', () => {
  it('formats squad name and rank', () => {
    expect(squadScoreChipCopy(chip('x', 'Social Friday', 3))).toEqual({
      label: 'Social Friday #3',
      ariaLabel: 'Social Friday, rank 3',
    });
  });
});
