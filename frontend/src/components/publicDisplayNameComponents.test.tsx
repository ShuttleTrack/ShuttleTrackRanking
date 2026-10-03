import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CheckInPlayerRow } from '@/components/check-in/CheckInPlayerRow';
import MatchScoreRow from '@/components/matches/MatchScoreRow';
import { PlayerCard } from '@/components/game-planner/PlayerCard';
import { GroupCard } from '@/components/game-day/GroupCard';
import type { Player } from '@/types/player';
import type { GamePlannerPlayer } from '@/hooks/useGamePlayers';

const FULL_NAME = 'nishan karunarathna';
const SHORT = 'Nishan K';

const rosterPlayer = {
  id: 1,
  name: FULL_NAME,
  colorHex: 'aabbcc',
  playerRank: 3,
};

const plannerPlayer: GamePlannerPlayer = {
  id: 1,
  name: FULL_NAME,
  rankScore: 1500,
  playerRank: 3,
  previousRank: 4,
  colorHex: 'aabbcc',
  highestRank: 2,
  timeInHighestRank: '5d',
  active: true,
  playerType: 'FULLTIME',
  status: 'ACTIVE',
  hasScore: true,
  isActiveReplacement: false,
};

const groupPlayer: Player = {
  ...plannerPlayer,
};

function expectShortName(html: string) {
  expect(html).toContain(SHORT);
  expect(html).not.toContain('Karunarathna');
}

describe('publicDisplayName in presentational components', () => {
  it('CheckInPlayerRow', () => {
    expectShortName(
      renderToStaticMarkup(<CheckInPlayerRow player={rosterPlayer} isCurrentUser={false} />),
    );
  });

  it('MatchScoreRow', () => {
    expectShortName(
      renderToStaticMarkup(
        <MatchScoreRow
          team1={[FULL_NAME, 'ada lovelace']}
          team2={['bob smith', 'carol']}
          team1Score={0}
          team2Score={0}
          showResultChips={false}
        />,
      ),
    );
  });

  it('PlayerCard', () => {
    expectShortName(
      renderToStaticMarkup(
        <PlayerCard player={plannerPlayer} isSelected={false} onToggle={() => {}} />,
      ),
    );
  });

  it('GroupCard', () => {
    expectShortName(renderToStaticMarkup(<GroupCard groupName="Group 1" players={[groupPlayer]} />));
  });
});
