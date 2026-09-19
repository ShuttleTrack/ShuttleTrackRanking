import React from 'react';
import { ScoreBreakdown } from '@/types/encounter';

interface ScoreBreakdownPillsProps {
  breakdown: ScoreBreakdown | null | undefined;
  groupIndex?: number | null;
  totalGroups?: number | null;
  /** When true, omit the base elo chip (e.g. when it duplicates the headline points). */
  hideBaseElo?: boolean;
  /** Pill row alignment; `end` keeps chips under right-aligned Points (desktop encounters). */
  align?: 'start' | 'end';
  className?: string;
}

const ScoreBreakdownPills: React.FC<ScoreBreakdownPillsProps> = ({
  breakdown,
  groupIndex,
  totalGroups,
  hideBaseElo = false,
  align = 'start',
  className = '',
}) => {
  if (!breakdown) return null;

  const hasTier = breakdown.tierAdjustment !== 0;
  const hasConsolation = breakdown.consolation !== 0;
  const showElo = !hideBaseElo;

  if (!showElo && !hasTier && !hasConsolation) return null;

  const formatValue = (val: number) => (val > 0 ? '+' : '') + val.toFixed(1);

  const groupTitle =
    groupIndex != null && totalGroups != null
      ? `Group ${groupIndex} of ${totalGroups}`
      : undefined;

  const chipClass =
    'inline-block whitespace-nowrap font-label text-[10px] sm:text-xs px-1.5 py-0.5 rounded-md bg-surface-container-high text-on-surface-variant';

  const eloChipClass =
    'inline-block whitespace-nowrap font-label text-[10px] px-1 py-0 rounded-md bg-surface-container-high text-on-surface-variant';

  const justifyClass =
    align === 'end' ? 'justify-end' : 'justify-end md:justify-start';

  return (
    <div
      className={`flex flex-wrap gap-1 ${justifyClass} ${className}`}
      title={groupTitle}
    >
      {showElo && (
        <span className={eloChipClass}>
          elo{' '}
          <span className="font-numeric tabular-nums">{formatValue(breakdown.baseElo)}</span>
        </span>
      )}
      {hasTier && (
        <span className={chipClass}>
          tier{' '}
          <span className="font-numeric tabular-nums">{formatValue(breakdown.tierAdjustment)}</span>
        </span>
      )}
      {hasConsolation && (
        <span className={`${chipClass} text-primary-container`}>
          consol{' '}
          <span className="font-numeric tabular-nums">{formatValue(breakdown.consolation)}</span>
        </span>
      )}
    </div>
  );
};

export default ScoreBreakdownPills;
