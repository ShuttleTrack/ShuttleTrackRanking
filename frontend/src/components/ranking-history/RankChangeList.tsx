import { format, parseISO } from 'date-fns';
import TrendIndicator from '@/components/leaderboard/TrendIndicator';
import type { RowVariant } from '@/components/leaderboard/RankBadge';
import type { RankChangeRow } from '@/utils/rankHistory';

interface RankChangeListProps {
  rows: RankChangeRow[];
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  rowVariant: RowVariant;
}

function formatListDate(dateKey: string): string {
  try {
    return format(parseISO(dateKey), 'd MMM yyyy');
  } catch {
    return dateKey;
  }
}

const RankChangeList = ({
  rows,
  selectedDate,
  onSelectDate,
  rowVariant,
}: RankChangeListProps) => {
  if (rows.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-on-surface-variant">
        No ranking changes recorded yet.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-gray-600">
      {rows.map((row) => {
        const active = row.date === selectedDate;
        return (
          <li key={row.date}>
            <button
              type="button"
              onClick={() => onSelectDate(row.date)}
              className={`flex w-full min-h-[52px] items-center justify-between gap-3 px-3 py-3 sm:px-4 text-left transition-colors ${
                active ? 'bg-primary/10' : 'hover:bg-surface-container-high/60'
              }`}
            >
              <span className="font-label text-xs sm:text-sm text-on-surface-variant shrink-0">
                {formatListDate(row.date)}
              </span>
              <span className="font-numeric tabular-nums text-sm sm:text-base text-on-surface">
                #{String(row.oldRank).padStart(2, '0')}
                <span className="mx-1.5 text-on-surface-variant opacity-60">→</span>
                #{String(row.newRank).padStart(2, '0')}
              </span>
              <TrendIndicator rankChange={row.rankChange} variant={rowVariant} />
            </button>
          </li>
        );
      })}
    </ul>
  );
};

export default RankChangeList;
