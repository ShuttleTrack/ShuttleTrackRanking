import type { PlayerRankingData } from '@/types/rankings';
import LeaderboardRow from './LeaderboardRow';

interface LeaderboardProps {
  players: PlayerRankingData[];
}

const Leaderboard = ({ players }: LeaderboardProps) => (
  <section className="max-w-7xl mx-auto px-4 sm:px-8 pb-16 sm:pb-20">
    <div className="hidden md:grid grid-cols-12 px-8 py-4 font-label text-xs font-bold uppercase tracking-widest text-on-surface-variant opacity-60">
      <div className="col-span-1">Rank</div>
      <div className="col-span-4">Player Details</div>
      <div className="col-span-2 text-center">Last 5 Games</div>
      <div className="col-span-2 text-center">Win Rate</div>
      <div className="col-span-2 text-right">Points</div>
      <div className="col-span-1 text-right">Trend</div>
    </div>
    <div className="space-y-3">
      {players.map((player) => (
        <LeaderboardRow key={player.id} player={player} />
      ))}
    </div>
  </section>
);

export default Leaderboard;
