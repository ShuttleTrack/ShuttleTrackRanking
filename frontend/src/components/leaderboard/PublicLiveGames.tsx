import React from 'react';
import Link from 'next/link';
import type { PublicLiveGame } from '@/hooks/usePublicLiveGames';

// "Live now" strip on the site-root board: one card per in-progress game in a public squad,
// linking to that squad's public game viewer. Renders nothing when no game is live.
const PublicLiveGames = ({ games }: { games: PublicLiveGame[] }) => {
  if (games.length === 0) return null;

  return (
    <section
      className="max-w-7xl mx-auto px-8 sm:px-16 mt-6 sm:mt-8"
      aria-labelledby="public-live-games-heading"
    >
      <h2
        id="public-live-games-heading"
        className="mb-3 flex items-center gap-2 font-label text-xs font-bold uppercase tracking-widest text-red-400"
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 motion-safe:animate-ping" aria-hidden />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-red-400" aria-hidden />
        </span>
        Live now
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {games.map((game) => (
          <li key={game.id}>
            <Link
              href={`/s/${game.squad.slug}/game-viewer?gameId=${game.id}`}
              className="block rounded-xl border border-gray-600 bg-surface-container px-4 py-3 transition-colors hover:border-primary/40"
              aria-label={`Watch live game in ${game.squad.name}, ${game.progress}% complete`}
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-headline font-semibold text-on-surface">{game.squad.name}</p>
                  <p className="text-xs text-on-surface-variant">Game #{game.id.slice(-4)}</p>
                </div>
                <span className="font-numeric text-sm text-on-surface-variant tabular-nums">
                  {game.progress}%
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-white/10">
                <div
                  className="h-1.5 rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${game.progress}%` }}
                />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default PublicLiveGames;
