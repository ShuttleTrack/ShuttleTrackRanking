import React from 'react';
import { ScoreBreakdown } from '@/types/encounter';

interface ScoreBreakdownPillsProps {
  breakdown: ScoreBreakdown | null | undefined;
  groupIndex?: number | null;
  totalGroups?: number | null;
}

const ScoreBreakdownPills: React.FC<ScoreBreakdownPillsProps> = ({ breakdown, groupIndex, totalGroups }) => {
  if (!breakdown) return null;

  const hasTier = breakdown.tierAdjustment !== 0;
  const hasConsolation = breakdown.consolation !== 0;

  const formatValue = (val: number) => (val > 0 ? '+' : '') + val.toFixed(1);

  return (
    <div className="flex flex-wrap gap-1 mt-1" title={
      groupIndex && totalGroups
        ? `Group ${groupIndex} of ${totalGroups}`
        : undefined
    }>
      <span className="inline-block text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
        elo {formatValue(breakdown.baseElo)}
      </span>
      {hasTier && (
        <span className="inline-block text-xs px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
          tier {formatValue(breakdown.tierAdjustment)}
        </span>
      )}
      {hasConsolation && (
        <span className="inline-block text-xs px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">
          consol {formatValue(breakdown.consolation)}
        </span>
      )}
    </div>
  );
};

export default ScoreBreakdownPills;
