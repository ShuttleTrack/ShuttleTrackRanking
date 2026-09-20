import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { usePlayers } from '@/hooks/usePlayers';
import { useEncounterHistory } from '@/hooks/useEncounterHistory';
import { GameLoader, PageLoader } from '@/components/common/GameLoader';
import StatCard from '@/components/encounters/StatCard';
import EncounterCard from '@/components/encounters/EncounterCard';
import EncounterDesktopHeader from '@/components/encounters/EncounterDesktopHeader';
import SearchablePlayerPicker from '@/components/encounter-history/SearchablePlayerPicker';
import {
  buildEncounterQuery,
  duplicateTeamPlayerError,
  EMPTY_ENCOUNTER_TEAM_QUERY,
  formatEncounterGroupDate,
  hasAnyTeamSelection,
  parseEncounterQuery,
  summarizeEncounters,
  type EncounterTeamQuery,
} from '@/utils/encounterHistory';

type SlotKey = keyof EncounterTeamQuery;

const SLOT_KEYS: SlotKey[] = ['teamA1', 'teamA2', 'teamB1', 'teamB2'];

const FIND_MATCHES_BUTTON_CLASS =
  'inline-flex min-h-[44px] items-center justify-center rounded-xl bg-primary px-8 py-3 font-headline font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed';

function excludeIdsForSlot(slots: EncounterTeamQuery, slot: SlotKey): number[] {
  return SLOT_KEYS.filter((key) => key !== slot)
    .map((key) => slots[key])
    .filter((id) => id !== 0);
}

function sortEncountersNewestFirst<T extends { encounterDate: string; encounterId: number }>(
  encounters: T[],
): T[] {
  return [...encounters].sort((a, b) => {
    const d = b.encounterDate.localeCompare(a.encounterDate);
    if (d !== 0) return d;
    return b.encounterId - a.encounterId;
  });
}

const EncounterHistoryView = () => {
  const router = useRouter();
  const [slots, setSlots] = useState<EncounterTeamQuery>(EMPTY_ENCOUNTER_TEAM_QUERY);
  const [searchedSlots, setSearchedSlots] = useState<EncounterTeamQuery | null>(null);

  useEffect(() => {
    if (!router.isReady) return;
    const parsed = parseEncounterQuery(router.query);
    setSlots(parsed);
    if (parsed.teamA1 && !duplicateTeamPlayerError(parsed)) {
      setSearchedSlots(parsed);
    } else {
      setSearchedSlots(null);
    }
  }, [router.isReady, router.query]);

  const validationError = duplicateTeamPlayerError(slots);
  const searchedValidationError = searchedSlots ? duplicateTeamPlayerError(searchedSlots) : null;
  const canFetch = Boolean(
    searchedSlots?.teamA1 && !searchedValidationError,
  );

  const { players, isLoading: playersLoading, error: playersError } = usePlayers();
  const { encounters, isLoading: encountersLoading, error: encountersError } = useEncounterHistory(
    searchedSlots ?? EMPTY_ENCOUNTER_TEAM_QUERY,
    canFetch,
  );

  const updateSlot = useCallback((key: SlotKey, playerId: number) => {
    setSlots((prev) => ({ ...prev, [key]: playerId }));
  }, []);

  const handleFindMatches = useCallback(() => {
    if (!slots.teamA1 || validationError) return;
    const next = { ...slots };
    setSearchedSlots(next);
    router.replace(
      { pathname: router.pathname, query: buildEncounterQuery(next) },
      undefined,
      { shallow: true },
    );
  }, [router, slots, validationError]);

  const clearAll = useCallback(() => {
    setSlots(EMPTY_ENCOUNTER_TEAM_QUERY);
    setSearchedSlots(null);
    router.replace({ pathname: router.pathname, query: {} }, undefined, { shallow: true });
  }, [router]);

  const sortedEncounters = useMemo(
    () => (encounters ? sortEncountersNewestFirst(encounters) : []),
    [encounters],
  );

  const summary = useMemo(
    () => (encounters ? summarizeEncounters(encounters) : null),
    [encounters],
  );

  if (playersLoading) {
    return <PageLoader variant="compact" label="Loading encounter history" />;
  }

  if (playersError) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-12">
        <div className="rounded-xl border border-red-500/30 bg-red-950/20 px-6 py-4 text-red-300">
          Error loading players: {playersError.message}
        </div>
      </div>
    );
  }

  const showResults =
    canFetch && !encountersLoading && encounters !== undefined && summary !== null;
  const winRateDisplay = summary ? `${summary.winRate.toFixed(1)}%` : '—';
  const findDisabled = !slots.teamA1 || !!validationError || encountersLoading;

  return (
    <div className="pb-8">
      <section className="max-w-7xl mx-auto px-4 sm:px-8 mt-6 sm:mt-8 mb-4 sm:mb-6">
        <h1 className="font-headline text-2xl sm:text-3xl font-extrabold tracking-tight text-on-surface">
          Encounter History
        </h1>
        <div className="mt-3 h-0.5 w-10 rounded-full bg-primary" aria-hidden />
        <p className="mt-2 text-sm sm:text-base text-on-surface-variant max-w-2xl">
          Select players to find the matches they played together.
        </p>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-8 space-y-4 sm:space-y-6">
        <section className="rounded-xl border border-gray-600 bg-surface-container p-3 sm:p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="font-label text-xs uppercase tracking-wide text-on-surface-variant">
              Match filters
            </p>
            {hasAnyTeamSelection(slots) ? (
              <button
                type="button"
                onClick={clearAll}
                className="font-headline text-xs font-semibold text-primary hover:text-primary-container shrink-0"
              >
                Clear
              </button>
            ) : null}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr,auto,1fr] gap-4 md:gap-6 items-start">
            <div className="space-y-4 rounded-xl border border-gray-600/80 bg-surface-container-high/40 p-3 sm:p-4">
              <h2 className="font-headline text-sm font-semibold text-on-surface text-center md:text-left">
                Team 1
              </h2>
              <SearchablePlayerPicker
                players={players}
                selectedPlayerId={slots.teamA1}
                onSelect={(id) => updateSlot('teamA1', id)}
                excludeIds={excludeIdsForSlot(slots, 'teamA1')}
                label="Player 1"
                required
              />
              <SearchablePlayerPicker
                players={players}
                selectedPlayerId={slots.teamA2}
                onSelect={(id) => updateSlot('teamA2', id)}
                excludeIds={excludeIdsForSlot(slots, 'teamA2')}
                label="Player 2"
              />
            </div>

            <div className="hidden md:flex items-center justify-center self-center pt-8">
              <span
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-primary/40 bg-primary/10 font-label text-xs font-bold uppercase tracking-widest text-primary"
                aria-hidden
              >
                VS
              </span>
            </div>

            <div className="md:hidden flex items-center gap-3 py-1" aria-hidden>
              <div className="h-px flex-1 bg-gray-600" />
              <span className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">
                versus
              </span>
              <div className="h-px flex-1 bg-gray-600" />
            </div>

            <div className="space-y-4 rounded-xl border border-gray-600/80 bg-surface-container-high/40 p-3 sm:p-4">
              <h2 className="font-headline text-sm font-semibold text-on-surface text-center md:text-left">
                Team 2
              </h2>
              <SearchablePlayerPicker
                players={players}
                selectedPlayerId={slots.teamB1}
                onSelect={(id) => updateSlot('teamB1', id)}
                excludeIds={excludeIdsForSlot(slots, 'teamB1')}
                label="Player 1"
              />
              <SearchablePlayerPicker
                players={players}
                selectedPlayerId={slots.teamB2}
                onSelect={(id) => updateSlot('teamB2', id)}
                excludeIds={excludeIdsForSlot(slots, 'teamB2')}
                label="Player 2"
              />
            </div>
          </div>

          {validationError ? (
            <p className="mt-4 text-center text-sm text-red-400" role="alert">
              {validationError}
            </p>
          ) : null}

          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={handleFindMatches}
              disabled={findDisabled}
              className={FIND_MATCHES_BUTTON_CLASS}
            >
              {encountersLoading ? (
                <>
                  <GameLoader
                    size="sm"
                    label="Finding matches"
                    caption={false}
                    decorative
                    inline
                    className="text-black"
                  />
                  <span className="ml-2">Finding…</span>
                </>
              ) : (
                'Find Matches'
              )}
            </button>
          </div>
        </section>

        {canFetch && encountersError ? (
          <div className="rounded-xl border border-red-500/30 bg-red-950/20 px-6 py-4 text-red-300">
            Error loading matches: {encountersError.message}
          </div>
        ) : null}

        {showResults ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
              <StatCard label="Games" value={summary.totalGames} />
              <StatCard label="Wins" value={summary.wins} tone="win" />
              <StatCard label="Losses" value={summary.losses} tone="loss" />
              <StatCard label="Win Rate" value={winRateDisplay} />
            </div>

            <section className="rounded-xl border border-gray-600 bg-surface-container overflow-hidden">
              <div className="border-b border-gray-600 px-3 py-2 sm:px-4 sm:py-3">
                <h2 className="font-label text-xs font-bold uppercase tracking-wide text-on-surface-variant flex items-center gap-2">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                  Match results
                </h2>
              </div>
              {sortedEncounters.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-on-surface-variant">
                  No matches found for these players.
                </p>
              ) : (
                <div className="p-2 sm:p-3 space-y-3">
                  <EncounterDesktopHeader />
                  <div className="space-y-3">
                    {sortedEncounters.map((encounter) => (
                      <div key={encounter.encounterId}>
                        <p
                          className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant opacity-60 px-1 mb-1"
                        >
                          {formatEncounterGroupDate(encounter.encounterDate)}
                        </p>
                        <EncounterCard encounter={encounter} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
};

export default EncounterHistoryView;
