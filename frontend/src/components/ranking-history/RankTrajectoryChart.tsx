import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import type { RankingHistoryData } from '@/types/rankings';
import type { RankChangeRow } from '@/utils/rankHistory';
import { chartYDomain, mergeHistoryForChart, playerKeysInHistory } from '@/utils/rankHistory';

interface RankTrajectoryChartProps {
  history: RankingHistoryData[];
  selectedPlayerKey: string;
  playerColors: Record<string, string>;
  highlightDate: string | null;
  activeDate: string | null;
  activeRankChange: RankChangeRow | null;
  onChartClick: (date: string | null) => void;
  showBackgroundLines: boolean;
}

function formatTick(dateKey: string): string {
  try {
    return format(parseISO(dateKey), 'd MMM');
  } catch {
    return dateKey;
  }
}

function strokeForKey(key: string, colors: Record<string, string>): string {
  const hex = colors[key];
  return hex ? `#${hex}` : '#EE8A33';
}

interface TooltipPayloadItem {
  dataKey?: string;
  value?: number;
  color?: string;
}

function ChartTooltip({
  active,
  payload,
  label,
  selectedPlayerKey,
  rankChange,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
  selectedPlayerKey: string;
  rankChange?: RankChangeRow['rankChange'] | null;
}) {
  if (!active || !label) return null;
  const primary = payload?.find((p) => p.dataKey === selectedPlayerKey);
  const rank = primary?.value;
  if (rank === undefined || rank === null) return null;

  let dateLabel = label;
  try {
    dateLabel = format(parseISO(String(label)), 'd MMM yyyy');
  } catch {
    /* keep label */
  }

  return (
    <div
      className="rounded-lg border border-gray-600 bg-surface-container-high px-3 py-2 shadow-lg"
      role="status"
    >
      <p className="font-label text-[10px] uppercase tracking-wide text-on-surface-variant">
        {dateLabel}
      </p>
      <p className="font-numeric text-lg font-bold tabular-nums text-on-surface">
        Rank #{String(rank).padStart(2, '0')}
      </p>
      {rankChange && rankChange.direction !== 'none' ? (
        <p className="font-numeric text-sm tabular-nums text-on-surface-variant mt-0.5">
          {rankChange.direction === 'up' ? '+' : '-'}
          {rankChange.amount} from prior day
        </p>
      ) : null}
    </div>
  );
}

const RankTrajectoryChart = ({
  history,
  selectedPlayerKey,
  playerColors,
  highlightDate,
  activeDate,
  activeRankChange,
  onChartClick,
  showBackgroundLines,
}: RankTrajectoryChartProps) => {
  const keys = useMemo(() => playerKeysInHistory(history), [history]);
  const chartData = useMemo(
    () => mergeHistoryForChart(history, keys),
    [history, keys],
  );

  const allRanks = useMemo(() => {
    const values: number[] = [];
    for (const row of chartData) {
      for (const key of keys) {
        const v = row[key];
        if (typeof v === 'number') values.push(v);
      }
    }
    return values;
  }, [chartData, keys]);

  const [yMin, yMax] = chartYDomain(allRanks);
  const tooltipDate = activeDate ?? highlightDate;

  const backgroundKeys = showBackgroundLines
    ? keys.filter((k) => k !== selectedPlayerKey)
    : [];

  return (
    <div className="w-full h-[220px] md:h-[320px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
          onClick={(state) => {
            const label = state?.activeLabel;
            if (typeof label === 'string') {
              onChartClick(label);
            }
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="rgb(68 68 68)" />
          <XAxis
            dataKey="date"
            tickFormatter={formatTick}
            tick={{ fill: '#C0C0C0', fontSize: 11 }}
            axisLine={{ stroke: '#444444' }}
            tickLine={{ stroke: '#444444' }}
            interval="preserveStartEnd"
            minTickGap={24}
          />
          <YAxis
            reversed
            domain={[yMin, yMax]}
            allowDecimals={false}
            tick={{ fill: '#C0C0C0', fontSize: 11 }}
            axisLine={{ stroke: '#444444' }}
            tickLine={{ stroke: '#444444' }}
            width={32}
          />
          <Tooltip
            content={
              <ChartTooltip
                selectedPlayerKey={selectedPlayerKey}
                rankChange={activeRankChange?.rankChange ?? null}
              />
            }
            cursor={{ stroke: '#EE8A33', strokeWidth: 1, strokeDasharray: '4 4' }}
            active={tooltipDate != null}
            label={tooltipDate ?? undefined}
            payload={
              tooltipDate
                ? [
                    {
                      dataKey: selectedPlayerKey,
                      value: chartData.find((r) => r.date === tooltipDate)?.[
                        selectedPlayerKey
                      ] as number,
                      color: strokeForKey(selectedPlayerKey, playerColors),
                    },
                  ]
                : undefined
            }
          />
          {backgroundKeys.map((key) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={strokeForKey(key, playerColors)}
              strokeOpacity={0.12}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          ))}
          <Line
            type="monotone"
            dataKey={selectedPlayerKey}
            stroke={strokeForKey(selectedPlayerKey, playerColors)}
            strokeWidth={2.5}
            dot={{
              r: 5,
              strokeWidth: 2,
              fill: strokeForKey(selectedPlayerKey, playerColors),
              stroke: '#1A1A1A',
            }}
            activeDot={{ r: 7, strokeWidth: 2 }}
            isAnimationActive={false}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default RankTrajectoryChart;
