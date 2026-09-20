import React, { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { capitalizeFirstLetter } from '@/utils/string';
import { usePlayers } from '@/hooks/usePlayers';
import { useRankingHistory } from '@/hooks/useRankingHistory';
import { PageLoader } from '@/components/common/GameLoader';

const RankingsHistoryComponent = () => {
  const { players, isLoading: playersLoading } = usePlayers();
  const { rankingHistory, isLoading: historyLoading } = useRankingHistory();
  const [playerColors, setPlayerColors] = useState<{ [key: string]: string }>({});
  const [highlightedPlayerKey, setHighlightedPlayerKey] = useState<string>();

  useEffect(() => {
    if (!playersLoading && players.length > 0) {
      const colorsMapping: { [key: string]: string } = {};
      players.forEach((player) => {
        colorsMapping[capitalizeFirstLetter(player.name)] = player.colorHex;
      });
      setPlayerColors(colorsMapping);
    }
  }, [players, playersLoading]);

  if (playersLoading || historyLoading) {
    return <PageLoader variant="compact" label="Loading ranking history" />;
  }

  const onLegendMouseEnter = (o: any) => {
    const { dataKey } = o;
    setHighlightedPlayerKey(dataKey);
  };

  const onLegendMouseLeave = () => setHighlightedPlayerKey(undefined);

  const renderLabel = (e: any) => {
    const { value, x, y, index } = e;
    const isFirstPlot = index === 0;
    const invertYPos = value == 1;
    // Nudge only the first label to the side so it doesn't overlap with the Y axis line.
    const lx = isFirstPlot ? x + 10 : x;
    // Invert the Y position of the label only when the plot reaches the top (eg: 1st place), preventing it from hiding when out of bound.
    const ly = invertYPos ? y + 18 : y - 10;

    return (
      <text
        className='recharts-text recharts-label'
        textAnchor='middle'
        fill='#808080'
        x={lx}
        y={ly}
        fontSize={12}
      >
        {value}
      </text>
    );
  };

  return (
    <ResponsiveContainer width='100%' height={400}>
      <LineChart
        data={rankingHistory}
        margin={{
          top: 5,
          right: 30,
          left: 20,
          bottom: 5,
        }}
      >
        <CartesianGrid strokeDasharray='3 3' />
        <XAxis dataKey='date' />
        <YAxis reversed={true} domain={['dataMin', 'dataMax']} />
        <Tooltip />
        <Legend
          onMouseEnter={onLegendMouseEnter}
          onMouseLeave={onLegendMouseLeave}
        />
        {rankingHistory.length > 0 &&
          Object.keys(rankingHistory[0])
            .filter((key) => key !== 'date')
            .map((key, idx) => {
              return (
                <Line
                  type='monotone'
                  dataKey={key}
                  stroke={
                    playerColors[key]
                      ? `#${playerColors[key]}`
                      : `#${Math.floor(Math.random() * 16777215).toString(16)}`
                  }
                  strokeOpacity={
                    highlightedPlayerKey
                      ? highlightedPlayerKey === key
                        ? 1
                        : 0.05
                      : 1
                  }
                  label={highlightedPlayerKey === key ? renderLabel : undefined}
                  dot={!highlightedPlayerKey || highlightedPlayerKey === key}
                  key={idx}
                />
              );
            })}
      </LineChart>
    </ResponsiveContainer>
  );
};

export default RankingsHistoryComponent;
