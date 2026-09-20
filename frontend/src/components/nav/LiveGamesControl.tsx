import React, { Fragment } from 'react';
import Link from 'next/link';
import { Menu, Transition } from '@headlessui/react';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import type { LiveGame } from '@/hooks/useLiveGames';
import { GameLoader } from '@/components/common/GameLoader';
import { classNames, menuPanelClass, menuTransitionProps } from './navUtils';
import { LiveGameMenuItems } from './LiveGameProgressList';

const liveChipClass =
  'inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 font-label text-xs uppercase tracking-wider text-red-400';

function LiveChipLabel() {
  return (
    <>
      <GameLoader
        size="sm"
        label="Live"
        caption={false}
        decorative
        inline
        motion="rally"
        className="text-red-400 shrink-0"
      />
      <span>Live</span>
    </>
  );
}

interface LiveGamesControlProps {
  liveGames: LiveGame[];
  isLoading: boolean;
  onNavigate?: () => void;
}

export function LiveGamesControl({ liveGames, isLoading, onNavigate }: LiveGamesControlProps) {
  if (isLoading || liveGames.length === 0) {
    return null;
  }

  if (liveGames.length === 1) {
    const game = liveGames[0];
    return (
      <Link
        href={`/game-viewer?gameId=${game.id}`}
        className={liveChipClass}
        aria-label={`Watch live game ${game.id.slice(-4)}`}
        onClick={onNavigate}
      >
        <LiveChipLabel />
      </Link>
    );
  }

  return (
    <Menu as="div" className="relative">
      <Menu.Button className={classNames(liveChipClass, 'gap-1')}>
        <LiveChipLabel />
        <ChevronDownIcon className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
      </Menu.Button>
      <Transition as={Fragment} {...menuTransitionProps}>
        <Menu.Items className={classNames(menuPanelClass, 'right-0 w-64 origin-top-right py-1')}>
          <LiveGameMenuItems
            games={liveGames}
            isLoading={false}
            onNavigate={onNavigate}
          />
        </Menu.Items>
      </Transition>
    </Menu>
  );
}

export function LiveGamesControlDesktop({
  liveGames,
  isLoading,
}: {
  liveGames: LiveGame[];
  isLoading: boolean;
}) {
  if (isLoading || liveGames.length === 0) {
    return null;
  }

  if (liveGames.length === 1) {
    const game = liveGames[0];
    return (
      <Link href={`/game-viewer?gameId=${game.id}`} className={liveChipClass} aria-label="Live">
        <LiveChipLabel />
      </Link>
    );
  }

  return (
    <Menu as="div" className="relative">
      <Menu.Button className={classNames(liveChipClass, 'gap-1')}>
        <LiveChipLabel />
        <ChevronDownIcon className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
      </Menu.Button>
      <Transition as={Fragment} {...menuTransitionProps}>
        <Menu.Items className={classNames(menuPanelClass, 'right-0 w-64 origin-top-right py-1')}>
          {isLoading ? (
            <div className="px-4 py-3 flex justify-center">
              <GameLoader size="sm" label="Loading live games" caption={false} />
            </div>
          ) : (
            <LiveGameMenuItems games={liveGames} isLoading={false} />
          )}
        </Menu.Items>
      </Transition>
    </Menu>
  );
}
