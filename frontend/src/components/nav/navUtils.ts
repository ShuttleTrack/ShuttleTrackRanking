export const BUILD_IDENTIFIER =
  process.env.NEXT_PUBLIC_BUILD_IDENTIFIER ?? 'local';

export function buildHistoryLinks(squadSlug: string) {
  return [
    {
      name: 'Ranking History',
      href: `/s/${squadSlug}/player-ranking-history`,
      hint: 'Rank changes over time',
    },
    {
      name: 'Encounter History',
      href: `/s/${squadSlug}/encounter-history`,
      hint: 'Search matches across players',
    },
  ] as const;
}

export function classNames(...classes: (string | boolean | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

export const menuPanelClass =
  'absolute top-full mt-2 rounded-xl bg-surface-container border border-white/5 shadow-xl focus:outline-none z-[60] py-1';

export const menuTransitionProps = {
  enter: 'transition ease-out duration-100',
  enterFrom: 'transform opacity-0 scale-95',
  enterTo: 'transform opacity-100 scale-100',
  leave: 'transition ease-in duration-75',
  leaveFrom: 'transform opacity-100 scale-100',
  leaveTo: 'transform opacity-0 scale-95',
};

export function isEncountersRoute(pathname: string): boolean {
  return pathname.includes('/player') && pathname.includes('/encounters');
}

export function isHistoryRoute(pathname: string): boolean {
  return pathname.endsWith('/player-ranking-history') || pathname.endsWith('/encounter-history');
}

export const scoreboardSegmentClass = (active: boolean) =>
  classNames(
    'inline-flex min-h-[36px] items-center justify-center rounded-lg px-3 py-1.5 font-label text-xs uppercase tracking-wider transition-colors',
    active
      ? 'bg-primary/15 text-primary shadow-[inset_0_0_0_1px_rgb(238_138_51_/_0.35)]'
      : 'text-white/75 hover:bg-white/5 hover:text-white'
  );
