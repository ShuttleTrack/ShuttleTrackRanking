import type { PlayerRankingData } from '@/types/rankings';
import { LEADERBOARD_DESKTOP_GRID } from './leaderboardGrid';
import LeaderboardRow from './LeaderboardRow';

interface LeaderboardProps {
  players: PlayerRankingData[];
}

const Leaderboard = ({ players }: LeaderboardProps) => (
  <section className="max-w-7xl mx-auto px-4 sm:px-8 pb-10 sm:pb-20">
    <div
      className={`${LEADERBOARD_DESKTOP_GRID} px-8 py-4 font-label text-xs font-bold uppercase tracking-widest text-on-surface-variant opacity-60`}
    >
      <div>Rank</div>
      <div>Player Details</div>
      <div className="text-center">Last 5 Games</div>
      <div className="text-center">Win Rate</div>
      <div className="text-center">Points</div>
      <div className="text-center">Last day</div>
      <div className="text-center">Trend</div>
    </div>
    <div className="space-y-1.5 md:space-y-3">
      {players.map((player) => (
        <LeaderboardRow key={player.id} player={player} />
      ))}
    </div>
  </section>
);

export default Leaderboard;
