import Link from 'next/link';
import { Fragment } from 'react';
import { Menu } from '@headlessui/react';
import { CheckIcon, Squares2X2Icon } from '@heroicons/react/24/outline';
import type { MySquadOption } from '@/hooks/useMySquads';
import { classNames } from './navUtils';

const sectionLabelClass =
  'px-3 py-1.5 font-label text-[10px] font-bold uppercase tracking-widest text-on-surface-variant';

function monogram(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

interface MonogramBadgeProps {
  name: string;
  isCurrent: boolean;
  size?: 'sm' | 'md';
}

function MonogramBadge({ name, isCurrent, size = 'sm' }: MonogramBadgeProps) {
  const dim = size === 'md' ? 'h-9 w-9 text-sm' : 'h-8 w-8 text-xs';
  return (
    <span
      className={classNames(
        'flex shrink-0 items-center justify-center rounded-lg font-headline font-bold',
        dim,
        isCurrent
          ? 'bg-primary/20 text-primary ring-1 ring-primary/40'
          : 'bg-white/[0.06] text-on-surface-variant'
      )}
      aria-hidden
    >
      {monogram(name)}
    </span>
  );
}

interface SquadSwitcherLinksProps {
  squads: MySquadOption[];
  currentSlug?: string | null;
  variant: 'account-menu' | 'mobile';
  onNavigate?: () => void;
}

export function SquadSwitcherLinks({
  squads,
  currentSlug,
  variant,
  onNavigate,
}: SquadSwitcherLinksProps) {
  const isDesktop = variant === 'account-menu';

  if (squads.length === 0) {
    const rowClass = isDesktop
      ? 'flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 font-headline text-sm text-on-surface transition-colors hover:bg-white/5'
      : 'flex min-h-[44px] items-center gap-3 rounded-lg px-3 font-headline text-base text-white/90 transition-colors hover:bg-white/5';

    const content = (
      <div className={isDesktop ? 'px-1.5 py-1' : 'py-1'}>
        <p className={classNames(sectionLabelClass, isDesktop ? '' : 'px-1')}>Squads</p>
        <Link href="/squads" className={rowClass} onClick={onNavigate}>
          <Squares2X2Icon className="h-8 w-8 shrink-0 rounded-lg bg-white/[0.06] p-1.5 text-on-surface-variant" aria-hidden />
          <span className="min-w-0 truncate">Your squads</span>
        </Link>
      </div>
    );

    return isDesktop ? (
      <Menu.Item as={Fragment} disabled>
        <>{content}</>
      </Menu.Item>
    ) : (
      content
    );
  }

  const rows = squads.map((squad) => {
    const isCurrent = squad.slug === currentSlug;
    const rowClass = classNames(
      'flex min-h-[44px] items-center gap-3 rounded-lg px-3 transition-colors',
      isDesktop ? 'font-headline text-sm' : 'font-headline text-base',
      isCurrent
        ? 'bg-primary/10 text-primary'
        : 'text-on-surface hover:bg-white/5'
    );

    const inner = (
      <>
        <MonogramBadge name={squad.name} isCurrent={isCurrent} size={isDesktop ? 'sm' : 'md'} />
        <span className="min-w-0 flex-1 truncate">{squad.name}</span>
        {isCurrent && <CheckIcon className="h-4 w-4 shrink-0 text-primary" aria-hidden />}
      </>
    );

    if (isDesktop) {
      return (
        <Menu.Item key={squad.id}>
          {({ active }) => (
            <Link
              href={`/s/${squad.slug}`}
              className={classNames(rowClass, active && !isCurrent ? 'bg-white/5' : '')}
              aria-current={isCurrent ? 'page' : undefined}
              onClick={onNavigate}
            >
              {inner}
            </Link>
          )}
        </Menu.Item>
      );
    }

    return (
      <Link
        key={squad.id}
        href={`/s/${squad.slug}`}
        className={rowClass}
        aria-current={isCurrent ? 'page' : undefined}
        onClick={onNavigate}
      >
        {inner}
      </Link>
    );
  });

  const wrapper = (
    <div className={isDesktop ? 'px-1.5 py-1' : 'py-1'}>
      <p className={classNames(sectionLabelClass, isDesktop ? '' : 'px-1')}>Squads</p>
      {isDesktop ? null : <div className="space-y-0.5">{rows}</div>}
    </div>
  );

  if (isDesktop) {
    return (
      <>
        <p className={sectionLabelClass}>Squads</p>
        {rows}
      </>
    );
  }

  return (
    <div className="py-1">
      <p className={classNames(sectionLabelClass, 'px-1')}>Squads</p>
      <div className="mt-0.5 space-y-0.5">{rows}</div>
    </div>
  );
}
