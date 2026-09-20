import { useState } from 'react';
import { useMyMatches } from '@/hooks/useMyMatches';
import { usePlayers } from '@/hooks/usePlayers';
import { useRequireUser } from '@/hooks/useRequireUser';
import { capitalizeFirstLetter } from '@/utils/string';
import { userScoreService } from '@/services/userScoreService';
import { isValidMatchScore } from '@/utils/scoreValidation';
import MatchResultLegend from '@/components/matches/MatchResultLegend';
import MatchScoreRow from '@/components/matches/MatchScoreRow';
import { GameLoader, PageLoader } from '@/components/common/GameLoader';

const MAX_POINTS = 30;

const outlineBtn =
  'inline-flex min-h-[44px] items-center justify-center rounded-xl border border-white/10 bg-surface-container-high/50 px-6 py-3 font-medium text-on-surface transition-colors hover:border-primary/40';
const primaryBtn =
  'inline-flex min-h-[44px] items-center justify-center rounded-xl bg-primary px-6 py-3 font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed';
const inputFieldClass =
  'w-full rounded-xl border border-gray-600 bg-surface-container px-4 py-3 text-center font-numeric text-lg text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40';
const modalBoxClass =
  'relative rounded-xl bg-surface-container-high border border-gray-600 p-6 w-full max-w-lg shadow-xl';
const modalActionsClass = 'flex flex-wrap justify-end gap-3 mt-6';

interface SelectedMatch {
  gameId: string;
  groupName: string;
  matchIndex: number;
  team1: string[];
  team2: string[];
}

const UserMatchesPage = () => {
  const { status, isUser } = useRequireUser();
  const { games, isLoading: matchesLoading, mutate: refreshMatches } = useMyMatches();
  const { players, isLoading: playersLoading } = usePlayers();
  const [selectedMatch, setSelectedMatch] = useState<SelectedMatch | null>(null);
  const [scores, setScores] = useState({
    team1Score: 0,
    team2Score: 0,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showScoreModal, setShowScoreModal] = useState(false);

  const getPlayerName = (id: string) => {
    const player = players.find((p) => p.id === parseInt(id, 10));
    return player ? player.name : id;
  };

  const teamNames = (ids: string[]) =>
    ids.map((id) => capitalizeFirstLetter(getPlayerName(id)));

  const openScoreEntry = (match: SelectedMatch) => {
    setSelectedMatch(match);
    setScores({ team1Score: 0, team2Score: 0 });
    setShowScoreModal(true);
  };

  const handleScoreSubmit = async () => {
    if (!selectedMatch || !isValidMatchScore(scores.team1Score, scores.team2Score)) return;

    setIsSubmitting(true);
    try {
      await userScoreService.submitScore({
        gameId: selectedMatch.gameId,
        groupName: selectedMatch.groupName,
        matchIndex: selectedMatch.matchIndex,
        team1Score: scores.team1Score,
        team2Score: scores.team2Score,
      });

      await refreshMatches();
      setSelectedMatch(null);
      setScores({ team1Score: 0, team2Score: 0 });
      setShowScoreModal(false);
    } catch (error) {
      console.error('Failed to submit score:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const closeScoreModal = () => {
    setShowScoreModal(false);
    setSelectedMatch(null);
    setScores({ team1Score: 0, team2Score: 0 });
  };

  if (status === 'loading' || matchesLoading || playersLoading) {
    return <PageLoader variant="tall" label="Loading" />;
  }

  if (!isUser) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 mt-6 sm:mt-8 pb-8">
      <header className="mb-4">
        <h1 className="font-headline text-3xl sm:text-4xl font-extrabold tracking-tight text-on-surface">
          Your matches
        </h1>
        <div className="mt-3 h-0.5 w-10 rounded-full bg-primary" aria-hidden />
      </header>

      <MatchResultLegend className="mb-6" />

      <div className="max-w-3xl space-y-6">
        {games.length === 0 ? (
          <div className="rounded-xl border border-gray-600 bg-surface-container px-6 py-12 text-center">
            <h3 className="font-headline text-lg font-semibold text-on-surface">No active matches</h3>
            <p className="mt-2 text-on-surface-variant">
              You don&apos;t have any matches in progress at the moment.
            </p>
          </div>
        ) : (
          games.map((game) => (
            <section
              key={game.id}
              className="overflow-hidden rounded-xl border border-gray-600 bg-surface-container"
            >
              <div className="flex items-center justify-between gap-3 border-b border-gray-600 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                  </span>
                  <h2 className="font-headline text-base font-semibold text-on-surface">
                    Game #{game.id.slice(-4)}
                  </h2>
                </div>
                <span className="text-sm text-on-surface-variant">
                  {new Date(game.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div className="space-y-3 p-4">
                {game.matches.map((match) => {
                  const unplayed = !match.team1Score && !match.team2Score;
                  const selection: SelectedMatch = {
                    gameId: game.id,
                    groupName: match.groupName,
                    matchIndex: match.matchIndex,
                    team1: match.team1,
                    team2: match.team2,
                  };

                  return (
                    <MatchScoreRow
                      key={`${match.groupName}-${match.matchIndex}`}
                      team1={teamNames(match.team1)}
                      team2={teamNames(match.team2)}
                      team1Score={match.team1Score}
                      team2Score={match.team2Score}
                      showResultChips={false}
                      interactive={unplayed}
                      onActivate={unplayed ? () => openScoreEntry(selection) : undefined}
                    />
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>

      {showScoreModal && selectedMatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className={modalBoxClass} role="dialog" aria-modal="true">
            <h3 className="font-headline text-lg font-semibold text-on-surface mb-4 text-center">
              Enter match score
            </h3>
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <div className="font-headline text-center font-medium text-on-surface">
                  {teamNames(selectedMatch.team1).join(' & ')}
                </div>
                <input
                  type="number"
                  inputMode="numeric"
                  className={inputFieldClass}
                  value={scores.team1Score || ''}
                  onChange={(e) =>
                    setScores((s) => ({
                      ...s,
                      team1Score: parseInt(e.target.value, 10) || 0,
                    }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === '+' || e.key === '-') e.preventDefault();
                  }}
                  min={0}
                  max={MAX_POINTS}
                  placeholder="0"
                />
              </div>
              <div className="text-center font-headline font-bold text-on-surface-variant">vs</div>
              <div className="space-y-2">
                <div className="font-headline text-center font-medium text-on-surface">
                  {teamNames(selectedMatch.team2).join(' & ')}
                </div>
                <input
                  type="number"
                  inputMode="numeric"
                  className={inputFieldClass}
                  value={scores.team2Score || ''}
                  onChange={(e) =>
                    setScores((s) => ({
                      ...s,
                      team2Score: parseInt(e.target.value, 10) || 0,
                    }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === '+' || e.key === '-') e.preventDefault();
                  }}
                  min={0}
                  max={MAX_POINTS}
                  placeholder="0"
                />
              </div>
            </div>
            <p className="mt-3 text-sm text-on-surface-variant">
              Scores must be between 0 and {MAX_POINTS} points and cannot be equal.
            </p>
            <div className={modalActionsClass}>
              <button type="button" className={outlineBtn} onClick={closeScoreModal} disabled={isSubmitting}>
                Cancel
              </button>
              <button
                type="button"
                className={primaryBtn}
                onClick={handleScoreSubmit}
                disabled={isSubmitting || !isValidMatchScore(scores.team1Score, scores.team2Score)}
              >
                {isSubmitting ? (
                  <span className="inline-flex items-center gap-2">
                    <GameLoader size="sm" label="Saving score" caption={false} decorative inline className="text-black" />
                    Saving…
                  </span>
                ) : (
                  'Save score'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserMatchesPage;
