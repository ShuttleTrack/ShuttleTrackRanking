import {
  MATCH_RESULT_BAR_RING,
  MATCH_RESULT_LOSS,
  MATCH_RESULT_WIN,
} from '@/constants/matchResultColors';

interface MatchResultLegendProps {
  className?: string;
}

const MatchResultLegend = ({ className = '' }: MatchResultLegendProps) => (
  <div
    className={`flex flex-wrap items-center justify-center gap-x-5 gap-y-2 font-label text-xs uppercase tracking-wide text-on-surface-variant ${className}`}
    aria-label="Match result legend"
  >
    <span className="inline-flex items-center gap-2">
      <span
        className="h-4 w-2 rounded-sm"
        style={{ background: MATCH_RESULT_WIN, boxShadow: MATCH_RESULT_BAR_RING }}
        aria-hidden
      />
      Win
    </span>
    <span className="inline-flex items-center gap-2">
      <span
        className="h-4 w-2 rounded-sm"
        style={{ background: MATCH_RESULT_LOSS, boxShadow: MATCH_RESULT_BAR_RING }}
        aria-hidden
      />
      Loss
    </span>
  </div>
);

export default MatchResultLegend;
