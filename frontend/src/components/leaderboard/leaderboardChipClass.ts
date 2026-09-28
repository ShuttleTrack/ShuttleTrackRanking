import type { RowVariant } from './RankBadge';

/** Podium-aware pill background/text for PeakTenure and SquadScoreChips. */
export const leaderboardChipClass: Record<RowVariant, string> = {
  gold: 'bg-yellow-950/10 text-yellow-900',
  silver: 'bg-slate-900/10 text-slate-700',
  bronze: 'bg-orange-950/10 text-orange-900',
  dark: 'bg-white/10 text-on-surface-variant',
  default: 'bg-white/10 text-on-surface-variant',
};
