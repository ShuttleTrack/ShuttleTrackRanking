import { useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import type { Player } from '@/types/player';
import { GameLoader } from '@/components/common/GameLoader';
import { filterPlayersByQuery, sortPlayersByName } from './playerNavSearchUtils';
import { NavPlayerRow } from './NavPlayerRow';
import { classNames } from './navUtils';

interface NavPlayerSearchProps {
  players: Player[];
  isLoading: boolean;
  /** desktop-popover: inside a popover panel, results only when query non-empty.
   *  mobile-encounters: inside the mobile overlay encounters section, same gating.
   */
  variant: 'desktop-popover' | 'mobile-encounters';
  onNavigate?: () => void;
}

export function NavPlayerSearch({
  players,
  isLoading,
  variant,
  onNavigate,
}: NavPlayerSearchProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');

  const sortedPlayers = useMemo(() => sortPlayersByName(players), [players]);
  const filtered = useMemo(
    () => filterPlayersByQuery(sortedPlayers, query),
    [sortedPlayers, query]
  );

  const handleSelect = (player: Player) => {
    void router.push(`/player/${player.id}/encounters`);
    setQuery('');
    onNavigate?.();
  };

  if (isLoading) {
    return (
      <div className="py-4 flex justify-center">
        <GameLoader size="sm" label="Loading players" caption={false} />
      </div>
    );
  }

  const showResults = query.trim().length >= 1;

  if (variant === 'desktop-popover') {
    return (
      <div className="w-72 p-2">
        <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant px-1 mb-2">
          Search player
        </p>
        <NavPlayerSearchField
          query={query}
          setQuery={setQuery}
          filtered={filtered}
          showResults={showResults}
          onSelect={handleSelect}
          placeholder="Type a name…"
          autoFocus
        />
      </div>
    );
  }

  // mobile-encounters
  return (
    <NavPlayerSearchField
      query={query}
      setQuery={setQuery}
      filtered={filtered}
      showResults={showResults}
      onSelect={handleSelect}
      placeholder="Search by name…"
    />
  );
}

function NavPlayerSearchField({
  query,
  setQuery,
  filtered,
  showResults,
  onSelect,
  placeholder,
  autoFocus,
}: {
  query: string;
  setQuery: (q: string) => void;
  filtered: Player[];
  showResults: boolean;
  onSelect: (player: Player) => void;
  placeholder: string;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-label="Search players for encounters"
        className="w-full min-h-[44px] rounded-lg border border-white/10 bg-surface-container-high px-3 py-2 font-headline text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
      {showResults ? (
        <ul className="mt-1 max-h-48 overflow-auto rounded-lg border border-white/5 bg-surface-container py-1 shadow-lg">
          {filtered.map((player) => (
            <li key={player.id}>
              <button
                type="button"
                className={classNames(
                  'relative flex w-full cursor-pointer min-h-[44px] items-center gap-2 px-3 py-2 text-left',
                  'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                )}
                onClick={() => onSelect(player)}
              >
                <NavPlayerRow player={player} />
              </button>
            </li>
          ))}
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-on-surface-variant">No players found.</li>
          ) : null}
        </ul>
      ) : (
        <p className="mt-2 px-1 text-xs text-on-surface-variant">
          Type a name to find encounters
        </p>
      )}
    </div>
  );
}
