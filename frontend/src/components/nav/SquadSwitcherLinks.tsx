import Link from 'next/link';
import { useRouter } from 'next/router';
import { Fragment } from 'react';
import { Menu } from '@headlessui/react';
import { CheckIcon, MagnifyingGlassCircleIcon, Squares2X2Icon } from '@heroicons/react/24/outline';
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
  const router = useRouter();
  const isDesktop = variant === 'account-menu';
  const isPublicCurrent = router.pathname === '/';

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
        <Link href="/squads/browse" className={rowClass} onClick={onNavigate}>
          <MagnifyingGlassCircleIcon className="h-8 w-8 shrink-0 rounded-lg bg-white/[0.06] p-1.5 text-on-surface-variant" aria-hidden />
          <span className="min-w-0 truncate">Find a squad</span>
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

  const renderRow = (
    key: string,
    href: string,
    label: string,
    badgeName: string,
    isCurrent: boolean
  ) => {
    const rowClass = classNames(
      'flex min-h-[44px] items-center gap-3 rounded-lg px-3 transition-colors',
      isDesktop ? 'font-headline text-sm' : 'font-headline text-base',
      isCurrent
        ? 'bg-primary/10 text-primary'
        : 'text-on-surface hover:bg-white/5'
    );

    const inner = (
      <>
        <MonogramBadge name={badgeName} isCurrent={isCurrent} size={isDesktop ? 'sm' : 'md'} />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {isCurrent && <CheckIcon className="h-4 w-4 shrink-0 text-primary" aria-hidden />}
      </>
    );

    if (isDesktop) {
      return (
        <Menu.Item key={key}>
          {({ active }) => (
            <Link
              href={href}
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
        key={key}
        href={href}
        className={rowClass}
        aria-current={isCurrent ? 'page' : undefined}
        onClick={onNavigate}
      >
        {inner}
      </Link>
    );
  };

  // "Find a squad" has to appear in this branch as well as the zero-squad one above: an existing
  // member looking for a *second* squad is exactly who the directory is for, and they never see
  // the other tree (SELF_REGISTRATION_PLAN.md). Rendered with an icon rather than a monogram
  // badge, since it isn't a squad.
  const renderFindRow = () => {
    const rowClass = classNames(
      'flex min-h-[44px] items-center gap-3 rounded-lg px-3 transition-colors text-on-surface hover:bg-white/5',
      isDesktop ? 'font-headline text-sm' : 'font-headline text-base'
    );
    const inner = (
      <>
        <MagnifyingGlassCircleIcon
          className={classNames(
            'shrink-0 rounded-lg bg-white/[0.06] p-1.5 text-on-surface-variant',
            isDesktop ? 'h-8 w-8' : 'h-9 w-9'
          )}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate">Find a squad</span>
      </>
    );

    if (isDesktop) {
      return (
        <Menu.Item key="find">
          {({ active }) => (
            <Link
              href="/squads/browse"
              className={classNames(rowClass, active ? 'bg-white/5' : '')}
              onClick={onNavigate}
            >
              {inner}
            </Link>
          )}
        </Menu.Item>
      );
    }

    return (
      <Link key="find" href="/squads/browse" className={rowClass} onClick={onNavigate}>
        {inner}
      </Link>
    );
  };

  const rows = [
    renderRow('public', '/', 'Public', 'Public', isPublicCurrent),
    ...squads.map((squad) =>
      renderRow(
        String(squad.id),
        `/s/${squad.slug}`,
        squad.name,
        squad.name,
        squad.slug === currentSlug
      )
    ),
    renderFindRow(),
  ];

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
