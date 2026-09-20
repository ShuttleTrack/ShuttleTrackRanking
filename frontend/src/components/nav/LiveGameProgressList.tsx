import Link from 'next/link';
import { Menu } from '@headlessui/react';
import type { LiveGame } from '@/hooks/useLiveGames';
import { GameLoader } from '@/components/common/GameLoader';
import { classNames } from './navUtils';
import { useSquad } from '@/contexts/SquadContext';

const rowLinkClass = (active: boolean) =>
  classNames(
    'block px-4 py-3 text-sm text-on-surface transition-colors',
    active ? 'bg-white/10' : 'hover:bg-white/5'
  );

export function LiveGameProgressCards({
  games,
  onNavigate,
  className,
}: {
  games: LiveGame[];
  onNavigate?: () => void;
  className?: string;
}) {
  const { slug } = useSquad();
  return (
    <div className={classNames('space-y-2', className)}>
      {games.map((game) => (
        <Link
          key={game.id}
          href={`/s/${slug}/game-viewer?gameId=${game.id}`}
          className={rowLinkClass(false)}
          onClick={onNavigate}
        >
          <div className="flex justify-between items-center mb-1">
            <span className="font-headline font-semibold">Game #{game.id.slice(-4)}</span>
            <span className="font-numeric text-sm text-on-surface-variant tabular-nums">
              {game.progress}%
            </span>
          </div>
          <div className="w-full bg-white/10 rounded-full h-1.5">
            <div
              className="bg-primary h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${game.progress}%` }}
            />
          </div>
        </Link>
      ))}
    </div>
  );
}

export function LiveGameMenuItems({
  games,
  isLoading,
  onNavigate,
}: {
  games: LiveGame[];
  isLoading: boolean;
  onNavigate?: () => void;
}) {
  const { slug } = useSquad();
  if (isLoading) {
    return (
      <div className="px-4 py-3 flex justify-center">
        <GameLoader size="sm" label="Loading live games" caption={false} />
      </div>
    );
  }

  return (
    <>
      {games.map((game) => (
        <Menu.Item key={game.id}>
          {({ active, close }) => (
            <Link
              href={`/s/${slug}/game-viewer?gameId=${game.id}`}
              className={rowLinkClass(active)}
              onClick={() => {
                close();
                onNavigate?.();
              }}
            >
              <div className="flex justify-between items-center mb-1">
                <span>Game #{game.id.slice(-4)}</span>
                <span className="text-sm text-on-surface-variant">{game.progress}%</span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-1.5">
                <div
                  className="bg-primary h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${game.progress}%` }}
                />
              </div>
            </Link>
          )}
        </Menu.Item>
      ))}
    </>
  );
}
