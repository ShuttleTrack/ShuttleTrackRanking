import { useEffect, useState } from 'react';
import type { SquadChip } from '@/types/rankings';
import type { RowVariant } from './RankBadge';
import { leaderboardChipClass } from './leaderboardChipClass';

const MOBILE_CAROUSEL_MS = 2500;

export function selectSquadScoreChips(squads: SquadChip[], max = 4): SquadChip[] {
  return squads.slice(0, max);
}

export function compareSquadChipsByWeight(a: SquadChip, b: SquadChip): number {
  if (b.publicWeight !== a.publicWeight) {
    return b.publicWeight - a.publicWeight;
  }
  if (a.playerRank !== b.playerRank) {
    return a.playerRank - b.playerRank;
  }
  return a.name.localeCompare(b.name);
}

export function squadChipsByWeight(squads: SquadChip[]): SquadChip[] {
  return [...squads].sort(compareSquadChipsByWeight);
}

export function mobileCarouselChips(squads: SquadChip[], max = 4): SquadChip[] {
  return selectSquadScoreChips(squadChipsByWeight(squads), max);
}

export function squadScoreChipCopy(chip: SquadChip): { label: string; ariaLabel: string } {
  return {
    label: `${chip.name} #${chip.playerRank}`,
    ariaLabel: `${chip.name}, rank ${chip.playerRank}`,
  };
}

function squadRanksAria(chips: SquadChip[]): string {
  return `Squad ranks: ${chips.map((c) => squadScoreChipCopy(c).ariaLabel).join('; ')}`;
}

function hiddenSquadsSummary(hidden: SquadChip[]): string {
  if (hidden.length === 0) return '';
  const names = hidden.map((s) => s.name).join(', ');
  return ` Also ranked in: ${names}.`;
}

function ChipPill({
  chip,
  pillClass,
  compact = false,
}: {
  chip: SquadChip;
  pillClass: string;
  /** When true, label may truncate to fit the carousel slot. */
  compact?: boolean;
}) {
  const { label, ariaLabel } = squadScoreChipCopy(chip);
  const labelClass = compact
    ? 'truncate font-numeric tabular-nums leading-none'
    : 'whitespace-nowrap font-numeric tabular-nums leading-none';
  return (
    <span className={pillClass} aria-label={ariaLabel} title={label}>
      <span className={labelClass}>{label}</span>
    </span>
  );
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

function MobileSquadChipCarousel({
  chips,
  pillClass,
}: {
  chips: SquadChip[];
  pillClass: string;
}) {
  const [index, setIndex] = useState(0);
  const reduceMotion = usePrefersReducedMotion();
  const aria = squadRanksAria(chips);

  useEffect(() => {
    if (chips.length <= 1 || reduceMotion) return;

    const id = window.setInterval(() => {
      if (document.hidden) return;
      setIndex((i) => (i + 1) % chips.length);
    }, MOBILE_CAROUSEL_MS);

    return () => window.clearInterval(id);
  }, [chips.length, reduceMotion]);

  const viewportClass = 'flex w-full items-center overflow-hidden md:hidden';

  const active = chips[index];
  const slotPillClass = `${pillClass} max-w-full min-w-0`;

  return (
    <span className={viewportClass} role="group" aria-label={aria}>
      <span className="flex w-full min-w-0 items-center justify-end overflow-hidden">
        <span
          key={active.slug}
          className="max-w-full min-w-0 motion-reduce:animate-none animate-fadeIn"
        >
          <ChipPill chip={active} pillClass={slotPillClass} compact />
        </span>
      </span>
    </span>
  );
}

interface SquadScoreChipsProps {
  squads: SquadChip[];
  variant: RowVariant;
  max?: number;
}

const SquadScoreChips = ({ squads, variant, max = 4 }: SquadScoreChipsProps) => {
  if (squads.length === 0) return null;

  const desktopVisible = selectSquadScoreChips(squads, max);
  const desktopHidden = squads.slice(max);
  const desktopAria =
    desktopHidden.length > 0
      ? `${squadRanksAria(desktopVisible)}.${hiddenSquadsSummary(desktopHidden)}`
      : squadRanksAria(desktopVisible);

  const pillClass = `inline-flex w-fit max-w-full shrink items-center rounded-full px-2 py-px font-label text-[10px] font-bold uppercase leading-none tracking-widest ${leaderboardChipClass[variant]}`;

  const mobileChips = mobileCarouselChips(squads, max);

  return (
    <span className="block w-full min-w-0 md:w-auto md:shrink-0">
      <span
        className="hidden min-w-0 max-w-full flex-col items-start gap-0.5 md:flex"
        role="group"
        aria-label={desktopAria}
      >
        {desktopVisible.map((chip) => (
          <ChipPill key={chip.slug} chip={chip} pillClass={pillClass} />
        ))}
      </span>

      <MobileSquadChipCarousel chips={mobileChips} pillClass={pillClass} />
    </span>
  );
};

export default SquadScoreChips;
