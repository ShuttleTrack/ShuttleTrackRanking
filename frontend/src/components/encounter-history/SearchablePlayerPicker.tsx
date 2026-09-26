import { Fragment, useMemo, useState } from 'react';
import { Combobox, Transition } from '@headlessui/react';
import { ChevronUpDownIcon, CheckIcon } from '@heroicons/react/24/outline';
import { publicDisplayName } from '@/utils/string';
import type { Player } from '@/types/player';

interface SearchablePlayerPickerProps {
  players: Player[];
  selectedPlayerId: number;
  onSelect: (playerId: number) => void;
  excludeIds?: number[];
  label: string;
  required?: boolean;
}

function PlayerOptionRow({
  player,
  showCheck,
}: {
  player: Player;
  showCheck: boolean;
}) {
  return (
    <>
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-white/10"
        style={{ backgroundColor: `#${player.colorHex}` }}
        aria-hidden
      />
      <span className="min-w-0 flex-1 font-headline text-sm font-semibold truncate">
        {publicDisplayName(player.name)}
      </span>
      {player.playerRank > 0 ? (
        <span className="font-numeric text-xs tabular-nums opacity-80 shrink-0">
          #{String(player.playerRank).padStart(2, '0')}
        </span>
      ) : (
        <span className="w-8 shrink-0" aria-hidden />
      )}
      {showCheck ? (
        <CheckIcon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      ) : (
        <span className="w-4 shrink-0" aria-hidden />
      )}
    </>
  );
}

const SearchablePlayerPicker = ({
  players,
  selectedPlayerId,
  onSelect,
  excludeIds = [],
  label,
  required = false,
}: SearchablePlayerPickerProps) => {
  const [query, setQuery] = useState('');

  const sortedPlayers = useMemo(
    () => [...players].sort((a, b) => a.name.localeCompare(b.name)),
    [players],
  );

  const availablePlayers = useMemo(
    () =>
      sortedPlayers.filter(
        (p) => p.id === selectedPlayerId || !excludeIds.includes(p.id),
      ),
    [sortedPlayers, excludeIds, selectedPlayerId],
  );

  const selected =
    sortedPlayers.find((p) => p.id === selectedPlayerId) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return availablePlayers;
    return availablePlayers.filter((p) => p.name.toLowerCase().includes(q));
  }, [availablePlayers, query]);

  return (
    <div>
      <p className="font-label text-xs uppercase tracking-wide text-on-surface-variant mb-2">
        {label}
        {required ? <span className="text-red-400 ml-0.5" aria-hidden>*</span> : null}
      </p>
      <Combobox
        value={selected}
        onChange={(player: Player | null) => {
          onSelect(player?.id ?? 0);
          setQuery('');
        }}
        nullable
      >
        <div className="relative">
          <div className="flex w-full min-h-[44px] items-center gap-2 rounded-xl border border-gray-600 bg-surface-container-high px-3 py-2.5 transition-colors hover:border-primary/40 focus-within:ring-2 focus-within:ring-primary">
            {selected ? (
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-white/10"
                style={{ backgroundColor: `#${selected.colorHex}` }}
                aria-hidden
              />
            ) : (
              <span className="h-2.5 w-2.5 shrink-0" aria-hidden />
            )}
            <Combobox.Input
              className="min-w-0 flex-1 border-0 bg-transparent p-0 font-headline text-sm font-semibold text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-0"
              displayValue={(player: Player | null) =>
                player ? publicDisplayName(player.name) : ''
              }
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Select player…"
              aria-label={label}
            />
            {selected && selected.playerRank > 0 ? (
              <span className="font-numeric text-xs tabular-nums text-on-surface-variant shrink-0">
                #{String(selected.playerRank).padStart(2, '0')}
              </span>
            ) : null}
            <Combobox.Button
              className="flex shrink-0 items-center"
              aria-label={`Open ${label} options`}
            >
              <ChevronUpDownIcon
                className="h-5 w-5 text-on-surface-variant"
                aria-hidden
              />
            </Combobox.Button>
          </div>
          <Transition
            as={Fragment}
            leave="transition ease-in duration-100"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <Combobox.Options
              className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-white/5 bg-surface-container py-1 shadow-lg focus:outline-none"
            >
              <Combobox.Option
                value={null}
                className={({ active }) =>
                  `relative flex cursor-pointer min-h-[44px] items-center gap-2 px-3 py-2 text-sm ${
                    active ? 'bg-surface-container-high text-on-surface' : 'text-on-surface-variant'
                  }`
                }
              >
                Select player…
              </Combobox.Option>
              {filtered.map((player) => (
                <Combobox.Option
                  key={player.id}
                  value={player}
                  className={({ active, selected: isSelected }) =>
                    `relative flex cursor-pointer min-h-[44px] items-center gap-2 px-3 py-2 ${
                      isSelected
                        ? 'bg-primary/10 text-on-surface'
                        : active
                          ? 'bg-surface-container-high text-on-surface'
                          : 'text-on-surface-variant'
                    }`
                  }
                >
                  {({ selected: isSelected }) => (
                    <PlayerOptionRow player={player} showCheck={isSelected} />
                  )}
                </Combobox.Option>
              ))}
              {filtered.length === 0 ? (
                <p className="px-3 py-2 text-sm text-on-surface-variant">No players found.</p>
              ) : null}
            </Combobox.Options>
          </Transition>
        </div>
      </Combobox>
    </div>
  );
};

export default SearchablePlayerPicker;
