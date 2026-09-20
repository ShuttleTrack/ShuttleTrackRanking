import { Fragment } from 'react';
import { Listbox, Transition } from '@headlessui/react';
import { ChevronUpDownIcon, CheckIcon } from '@heroicons/react/24/outline';
import { capitalizeFirstLetter } from '@/utils/string';
import type { Player } from '@/types/player';

interface PlayerPickerProps {
  players: Player[];
  selectedPlayerId: number | null;
  onSelect: (playerId: number) => void;
}

const PlayerPicker = ({ players, selectedPlayerId, onSelect }: PlayerPickerProps) => {
  const sorted = [...players]
    .filter((p) => p.playerRank > 0)
    .sort((a, b) => a.playerRank - b.playerRank);

  const selected =
    sorted.find((p) => p.id === selectedPlayerId) ?? sorted[0] ?? null;

  if (!selected) {
    return (
      <p className="text-sm text-on-surface-variant py-2">No active players.</p>
    );
  }

  return (
    <Listbox value={selected.id} onChange={onSelect}>
      <div className="relative">
        <Listbox.Button
          className="relative flex w-full min-h-[44px] items-center gap-2 rounded-xl border border-gray-600 bg-surface-container-high px-3 py-2.5 text-left transition-colors hover:border-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="Select player"
        >
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-white/10"
            style={{ backgroundColor: `#${selected.colorHex}` }}
            aria-hidden
          />
          <span className="min-w-0 flex-1 font-headline text-sm font-semibold text-on-surface truncate">
            {capitalizeFirstLetter(selected.name)}
          </span>
          <span className="font-numeric text-xs tabular-nums text-on-surface-variant shrink-0">
            #{String(selected.playerRank).padStart(2, '0')}
          </span>
          <ChevronUpDownIcon
            className="h-5 w-5 shrink-0 text-on-surface-variant"
            aria-hidden
          />
        </Listbox.Button>
        <Transition
          as={Fragment}
          leave="transition ease-in duration-100"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <Listbox.Options
            className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-white/5 bg-surface-container py-1 shadow-lg focus:outline-none"
          >
            {sorted.map((player) => (
              <Listbox.Option
                key={player.id}
                value={player.id}
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
                  <>
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-white/10"
                      style={{ backgroundColor: `#${player.colorHex}` }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 font-headline text-sm font-semibold truncate">
                      {capitalizeFirstLetter(player.name)}
                    </span>
                    <span className="font-numeric text-xs tabular-nums opacity-80 shrink-0">
                      #{String(player.playerRank).padStart(2, '0')}
                    </span>
                    {isSelected ? (
                      <CheckIcon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                    ) : (
                      <span className="w-4 shrink-0" aria-hidden />
                    )}
                  </>
                )}
              </Listbox.Option>
            ))}
          </Listbox.Options>
        </Transition>
      </div>
    </Listbox>
  );
};

export default PlayerPicker;
