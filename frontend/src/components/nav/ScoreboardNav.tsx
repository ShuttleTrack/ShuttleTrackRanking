import React, { Fragment } from 'react';
import Link from 'next/link';
import { Menu, Popover, Transition } from '@headlessui/react';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { useRouter } from 'next/router';
import type { Player } from '@/types/player';
import { NavPlayerSearch } from './NavPlayerSearch';
import {
  classNames,
  buildHistoryLinks,
  isEncountersRoute,
  isHistoryRoute,
  menuPanelClass,
  menuTransitionProps,
  scoreboardSegmentClass,
} from './navUtils';
import { useOptionalSquad } from '@/contexts/SquadContext';

interface ScoreboardNavProps {
  players: Player[];
  playersLoading: boolean;
}

export function ScoreboardNav({ players, playersLoading }: ScoreboardNavProps) {
  const router = useRouter();
  const squad = useOptionalSquad();
  const encountersActive = isEncountersRoute(router.pathname);
  const historyActive = isHistoryRoute(router.pathname);

  // Rankings/Encounters/History are all squad-specific boards - nothing to show without one
  // (the squad picker, login, and platform-admin pages render no SquadProvider).
  if (!squad) return null;

  const rankingsActive = router.pathname === '/s/[squad]';
  const historyLinks = buildHistoryLinks(squad.slug);

  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-xl border border-white/5 bg-white/[0.04] p-1"
      role="navigation"
      aria-label="Primary"
    >
      <Link
        href={`/s/${squad.slug}`}
        className={scoreboardSegmentClass(rankingsActive)}
        aria-current={rankingsActive ? 'page' : undefined}
      >
        Rankings
      </Link>

      <Popover className="relative">
        <>
          <Popover.Button
            className={classNames(scoreboardSegmentClass(encountersActive), 'gap-1')}
            aria-current={encountersActive ? 'page' : undefined}
          >
            Encounters
            <ChevronDownIcon className="h-3.5 w-3.5 opacity-70" aria-hidden />
          </Popover.Button>
          <Transition as={Fragment} {...menuTransitionProps}>
            <Popover.Panel
              className={classNames(
                menuPanelClass,
                'left-1/2 -translate-x-1/2 origin-top mt-2 py-0'
              )}
            >
              <NavPlayerSearch
                players={players}
                isLoading={playersLoading}
                variant="desktop-popover"
              />
            </Popover.Panel>
          </Transition>
        </>
      </Popover>

      <Menu as="div" className="relative inline-flex">
        <Menu.Button
          className={classNames(scoreboardSegmentClass(historyActive), 'gap-1')}
          aria-current={historyActive ? 'page' : undefined}
        >
          History
          <ChevronDownIcon className="h-3.5 w-3.5 opacity-70" aria-hidden />
        </Menu.Button>
        <Transition as={Fragment} {...menuTransitionProps}>
          <Menu.Items
            className={classNames(menuPanelClass, 'left-1/2 -translate-x-1/2 w-64 origin-top p-1.5')}
          >
            {historyLinks.map((link) => (
              <Menu.Item key={link.href}>
                {({ active }) => (
                  <Link
                    href={link.href}
                    className={classNames(
                      'block rounded-lg px-3 py-2.5 transition-colors',
                      active ? 'bg-white/10' : 'hover:bg-white/5'
                    )}
                    aria-current={router.asPath === link.href ? 'page' : undefined}
                  >
                    <span className="block font-headline text-sm font-semibold text-on-surface">
                      {link.name}
                    </span>
                    <span className="block text-xs text-on-surface-variant mt-0.5">
                      {link.hint}
                    </span>
                  </Link>
                )}
              </Menu.Item>
            ))}
          </Menu.Items>
        </Transition>
      </Menu>
    </div>
  );
}
