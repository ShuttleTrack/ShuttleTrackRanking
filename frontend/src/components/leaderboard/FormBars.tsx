import type { FormResult } from '@/utils/playerForm';
import type { RowVariant } from './RankBadge';

interface FormBarsProps {
  results: FormResult[];
  variant: RowVariant;
}

const FormBars = ({ results }: FormBarsProps) => {
  const padded: (FormResult | null)[] = [
    ...Array(Math.max(0, 5 - results.length)).fill(null),
    ...results,
  ].slice(-5) as (FormResult | null)[];

  return (
    <div className="flex justify-center gap-1.5">
      {padded.map((result, index) => (
        <div
          key={index}
          className="w-2 h-4 rounded-sm"
          style={
            result === 'W'
              ? { background: 'rgb(238 138 51)' }
              : result === 'L'
                ? { background: 'rgb(60 9 9)' }
                : { background: 'rgba(255 255 255 / 0.15)' }
          }
          aria-label={result === 'W' ? 'Win' : result === 'L' ? 'Loss' : 'No game'}
        />
      ))}
    </div>
  );
};

export default FormBars;
