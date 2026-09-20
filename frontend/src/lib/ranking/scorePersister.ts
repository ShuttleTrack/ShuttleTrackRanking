import type { Player as PrismaPlayer } from '@prisma/client';
import prisma from '@/lib/prisma';
import { calculateElo } from './eloCalculator';
import { parseTeamIds, getRankedPlayers } from './playerUtil';
import { decideAbsenteeAction, ABSENTEE_ENCOUNTER_ID, DISABLE_PLAYER_ENCOUNTER_ID, ACTIVATE_PLAYER_ENCOUNTER_ID } from './absenteeManager';
import { computeActivationScore } from './activation';

// Ported from backend core/ScorePersister.java + CommonAbsenteeManager.java + PlayerService.java
// (MIGRATION_PLAN.md Phase 3). DB-orchestrating wrappers around the pure logic in
// eloCalculator.ts / absenteeManager.ts / activation.ts - not wired into any API route yet
// (that's Phase 4). Not unit tested against Phase 0 fixtures (those only cover the pure math);
// spot-checked manually against the real local data with throwaway rows, see MIGRATION_PLAN.md.

const TIER_BOOST_MIN_SCORE_GAP = 200;

function todayDateOnly(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

async function insertScoreHistory(
  tx: PrismaTx,
  player: PrismaPlayer,
  encounterId: number,
  encounterDate: Date,
  oldRankScore: number,
  newRankScore: number
) {
  // ScorePersister.updateScoreHistory never sets playerNewRank (Java `int` field, so it
  // defaults to 0 via Lombok's builder) - preserved here rather than writing something more
  // "correct". For real match encounters this 0 gets overwritten by
  // ScoreHistoryService.updatePlayerEncounterNewRanking right after ranking recalculation; for
  // absentee/deactivate/activate rows outside that flow it can be left at 0 indefinitely.
  await tx.scoreHistory.create({
    data: {
      playerId: player.id,
      encounterId,
      oldRankScore,
      newRankScore,
      playerOldRank: player.playerRank ?? 0,
      playerNewRank: 0,
      encounterDate,
    },
  });
}

// Prisma's interactive-transaction client type, narrowed to what these helpers use.
type PrismaTx = Omit<typeof prisma, '$transaction' | '$connect' | '$disconnect' | '$on' | '$use' | '$extends'>;

// EloRankScoreCalculator.isScoreGapLargeEnough, computed fresh per call (the Java version
// caches per-date on the singleton bean across the whole process; not replicated here since it's
// a performance detail, not a correctness one, and a per-request cache would need request-scoped
// state this module doesn't have).
async function isScoreGapLargeEnoughForDate(squadId: number, encounterDate: Date): Promise<boolean> {
  const dayEncounters = await prisma.encounter.findMany({ where: { squadId, encounterDate } });
  const distinctTeamStrings = new Set<string>();
  for (const e of dayEncounters) {
    distinctTeamStrings.add(e.team1);
    distinctTeamStrings.add(e.team2);
  }
  const playerIds = new Set<number>();
  for (const teamString of Array.from(distinctTeamStrings)) {
    for (const id of parseTeamIds(teamString)) playerIds.add(id);
  }
  if (playerIds.size < 2) return false;
  const players = await prisma.player.findMany({ where: { id: { in: Array.from(playerIds) } } });
  const scores = players.map((p) => p.rankScore);
  return Math.max(...scores) - Math.min(...scores) >= TIER_BOOST_MIN_SCORE_GAP;
}

// EloRankScoreCalculator.calculateAndPersist(Encounter).
export async function calculateAndPersistElo(encounterId: number): Promise<void> {
  const encounter = await prisma.encounter.findUniqueOrThrow({ where: { id: encounterId } });
  const team1Players = await prisma.player.findMany({ where: { id: { in: parseTeamIds(encounter.team1) } } });
  const team2Players = await prisma.player.findMany({ where: { id: { in: parseTeamIds(encounter.team2) } } });

  const dayWideScoreGapLargeEnough = await isScoreGapLargeEnoughForDate(encounter.squadId, encounter.encounterDate);

  const result = calculateElo({
    team1AverageRankScore: team1Players.reduce((s, p) => s + p.rankScore, 0) / team1Players.length,
    team2AverageRankScore: team2Players.reduce((s, p) => s + p.rankScore, 0) / team2Players.length,
    team1SetPoints: encounter.team1SetPoints,
    team2SetPoints: encounter.team2SetPoints,
    groupIndex: encounter.groupIndex,
    totalGroups: encounter.totalGroups,
    dayWideScoreGapLargeEnough,
  });

  await prisma.$transaction(async (tx) => {
    await tx.encounter.update({
      where: { id: encounter.id },
      data: {
        calculatedScore: Math.abs(result.team1Score),
        processed: true,
        scoreBreakdown: result.breakdown as never,
      },
    });

    for (const [players, score] of [
      [team1Players, result.team1Score],
      [team2Players, result.team2Score],
    ] as const) {
      for (const player of players) {
        const newRankScore = player.rankScore + score;
        await tx.player.update({ where: { id: player.id }, data: { rankScore: newRankScore } });
        await insertScoreHistory(tx, player, encounter.id, encounter.encounterDate, player.rankScore, newRankScore);
      }
    }

    // ensurePlayersAreActive: any team member not currently ACTIVE (ENABLED, DISABLED, or
    // null) becomes ACTIVE just by having played - matches the Java version, including
    // reactivating a previously-DISABLED player.
    const allPlayers = [...team1Players, ...team2Players];
    const toReactivate = allPlayers.filter((p) => p.playerStatus !== 'ACTIVE');
    if (toReactivate.length > 0) {
      await tx.player.updateMany({
        where: { id: { in: toReactivate.map((p) => p.id) } },
        data: { playerStatus: 'ACTIVE' },
      });
    }
  });
}

// CommonAbsenteeManager.calculateAbsenteeScoreAndPersist.
export async function applyAbsenteeDeductions(playerIds: number[]): Promise<void> {
  const today = todayDateOnly();

  for (const playerId of playerIds) {
    const player = await prisma.player.findUniqueOrThrow({ where: { id: playerId } });
    // findAllByPlayerIdOrderByEncounterDateDescIdDesc, first 5.
    const recentHistory = await prisma.scoreHistory.findMany({
      where: { playerId },
      orderBy: [{ encounterDate: 'desc' }, { id: 'desc' }],
      take: 5,
    });
    const priorAbsences = recentHistory.filter((h) => h.encounterId === ABSENTEE_ENCOUNTER_ID).length;
    const decision = decideAbsenteeAction(priorAbsences);

    if (decision.action === 'deactivate') {
      await prisma.$transaction(async (tx) => {
        await tx.player.update({
          where: { id: player.id },
          data: { playerStatus: 'DISABLED', playerRank: -1, rankSince: today },
        });
        await insertScoreHistory(tx, player, DISABLE_PLAYER_ENCOUNTER_ID, today, player.rankScore, player.rankScore);
      });
    } else {
      const newRankScore = player.rankScore + decision.points;
      await prisma.$transaction(async (tx) => {
        await tx.player.update({ where: { id: player.id }, data: { rankScore: newRankScore } });
        await insertScoreHistory(tx, player, ABSENTEE_ENCOUNTER_ID, today, player.rankScore, newRankScore);
      });
    }
  }
}

// ScorePersister.activatePlayer, entered via PlayerService.activatePlayer's already-active guard.
export async function activatePlayer(squadId: number, playerId: number, explicitScore: number | null): Promise<void> {
  const player = await prisma.player.findUniqueOrThrow({ where: { id: playerId } });
  if (player.squadId !== squadId) {
    throw new Error(`Player not found: ${playerId}`);
  }
  if (player.playerStatus === 'ACTIVE') {
    return; // PlayerService.activatePlayer: "Player is already active" - no-op.
  }

  let currentSameRankPlayerScore: number | null = null;
  let currentMinActiveRankScore = 0;

  if (explicitScore === null) {
    const lastActiveGame = await prisma.scoreHistory.findFirst({
      where: { playerId, encounterId: { gt: 0 } },
      orderBy: { encounterDate: 'desc' },
    });
    if (!lastActiveGame) {
      throw new Error(`No prior active game found for player ${playerId} - cannot auto-calculate activation score`);
    }
    const activePlayers = await prisma.player.findMany({ where: { squadId: player.squadId, playerStatus: 'ACTIVE' } });
    const sameRankPlayer = activePlayers.find((p) => p.playerRank === lastActiveGame.playerNewRank);
    currentSameRankPlayerScore = sameRankPlayer ? sameRankPlayer.rankScore : null;
    currentMinActiveRankScore = Math.min(...activePlayers.map((p) => p.rankScore));
  }

  const newRankScore = computeActivationScore(explicitScore, {
    currentSameRankPlayerScore,
    currentMinActiveRankScore,
  });

  await prisma.$transaction(async (tx) => {
    await tx.player.update({ where: { id: player.id }, data: { playerStatus: 'ENABLED', rankScore: newRankScore } });
    await insertScoreHistory(tx, player, ACTIVATE_PLAYER_ENCOUNTER_ID, todayDateOnly(), player.rankScore, newRankScore);
  });
}

// ScorePersister.deactivatePlayer, as called by CommonAbsenteeManager for long-term absentees
// (also usable standalone, matching the Java method's own visibility).
export async function deactivatePlayer(squadId: number, playerId: number): Promise<void> {
  const player = await prisma.player.findUniqueOrThrow({ where: { id: playerId } });
  if (player.squadId !== squadId) {
    throw new Error(`Player not found: ${playerId}`);
  }
  const today = todayDateOnly();
  await prisma.$transaction(async (tx) => {
    await tx.player.update({
      where: { id: player.id },
      data: { playerStatus: 'DISABLED', playerRank: -1, rankSince: today },
    });
    await insertScoreHistory(tx, player, DISABLE_PLAYER_ENCOUNTER_ID, today, player.rankScore, player.rankScore);
  });
}

// PlayerService.updatePlayerRanking: re-rank all active players by rankScore desc (playerRank
// asc tiebreak), bumping highestRank/rankSince when a player reaches a new personal best.
// Returns the updated players (Java: `List<Player>`), needed by callers that then backfill
// ScoreHistory.playerNewRank for the day (see processEncounters.ts).
export async function updatePlayerRanking(squadId: number): Promise<PrismaPlayer[]> {
  const allPlayers = await prisma.player.findMany({ where: { squadId } });
  const activePlayers = allPlayers.filter((p) => p.playerStatus === 'ACTIVE');
  const ranked = getRankedPlayers(activePlayers.map((p) => ({ ...p, playerRank: p.playerRank ?? 0 })));

  const today = todayDateOnly();
  return prisma.$transaction(
    ranked.map((player, index) => {
      const newRank = index + 1;
      const data: { playerRank: number; highestRank?: number; rankSince?: Date } = { playerRank: newRank };
      // Java: `player.getPlayerRank() < player.getHighestRank()` would NPE on a null
      // highestRank (unboxes to int) - real data always has it populated (every player gets one
      // via addPlayer), but rather than replicate a crash on that edge case, a null here is
      // treated as "always a new personal best". Deliberate deviation, not covered by Phase 0's
      // fixtures (updatePlayerRanking wasn't characterized there).
      if (player.highestRank === null || newRank < player.highestRank) {
        data.highestRank = newRank;
        data.rankSince = today;
      }
      return prisma.player.update({ where: { id: player.id }, data });
    })
  );
}

// ScoreHistoryService.updatePlayerEncounterNewRanking: backfills playerNewRank on every
// ScoreHistory row for (playerId, encounterDate) - see the playerNewRank=0-default note above
// for why this backfill step exists at all.
export async function updatePlayerEncounterNewRanking(
  playerId: number,
  encounterDate: Date,
  newRanking: number
): Promise<void> {
  await prisma.scoreHistory.updateMany({
    where: { playerId, encounterDate },
    data: { playerNewRank: newRanking },
  });
}
