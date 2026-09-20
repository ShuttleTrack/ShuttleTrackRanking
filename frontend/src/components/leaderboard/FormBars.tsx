import type { CSSProperties } from 'react';
import {
  MATCH_RESULT_BAR_RING,
  MATCH_RESULT_EMPTY,
  MATCH_RESULT_LOSS,
  MATCH_RESULT_WIN,
} from '@/constants/matchResultColors';
import type { FormResult } from '@/utils/playerForm';
import type { RowVariant } from './RankBadge';

interface FormBarsProps {
  results: FormResult[];
  variant: RowVariant;
  /** Mobile: align with caption; desktop grid uses centered bars */
  align?: 'start' | 'center';
}

const BAR_RING: CSSProperties = { boxShadow: MATCH_RESULT_BAR_RING };

function barStyle(result: FormResult | null): CSSProperties {
  const ring = BAR_RING;
  if (result === 'W') {
    return { background: MATCH_RESULT_WIN, ...ring };
  }
  if (result === 'L') {
    return { background: MATCH_RESULT_LOSS, ...ring };
  }
  return { background: MATCH_RESULT_EMPTY, ...ring };
}

const FormBars = ({ results, variant: _variant, align = 'center' }: FormBarsProps) => {
  const padded: (FormResult | null)[] = [
    ...Array(Math.max(0, 5 - results.length)).fill(null),
    ...results,
  ].slice(-5) as (FormResult | null)[];

  const justifyClass =
    align === 'start' ? 'justify-start md:justify-center' : 'justify-center';

  return (
    <div className={`flex gap-1 md:gap-1.5 ${justifyClass}`}>
      {padded.map((result, index) => (
        <div
          key={index}
          className="h-3 w-1.5 md:h-4 md:w-2 rounded-sm"
          style={barStyle(result)}
          aria-label={result === 'W' ? 'Win' : result === 'L' ? 'Loss' : 'No game'}
        />
      ))}
    </div>
  );
};

export default FormBars;
