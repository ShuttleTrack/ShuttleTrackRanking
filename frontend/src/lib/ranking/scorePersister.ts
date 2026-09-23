import { PlayerType } from '@prisma/client';
import type { Player as PrismaPlayer } from '@prisma/client';
import prisma from '@/lib/prisma';
import { calculateElo } from './eloCalculator';
import { parseTeamIds, getRankedPlayers } from './playerUtil';
import {
  decideAbsenteeAction,
  decideOpenSlotAbsenteeAction,
  decideActiveReplacementAbsenteeAction,
  ABSENTEE_ENCOUNTER_ID,
  DISABLE_PLAYER_ENCOUNTER_ID,
  ACTIVATE_PLAYER_ENCOUNTER_ID,
} from './absenteeManager';
import { absenteeSpellDays, gameDaysSinceLastPlay } from './absenteeSpell';
import { computeActivationScore } from './activation';
import { removeDisabledPlayerFromGameDays } from '@/lib/gameDay/lifecycle';

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
  // Every participant should already be scored by this point (the game-create route rejects
  // scoreless players up front - see calculateAndPersistElo's requireScored below), but this
  // filter is a cheap defensive measure rather than trusting that boundary from two calls away.
  const scores = players.map((p) => p.rankScore).filter((s): s is number => s !== null);
  if (scores.length < 2) return false;
  return Math.max(...scores) - Math.min(...scores) >= TIER_BOOST_MIN_SCORE_GAP;
}

// Null-rankScore safety (OPEN_SLOT_PLAYERS_PLAN.md): it is never correct to compute an encounter
// with a scoreless participant. The real gate is server-side in the game-create route; this
// throws loudly rather than silently coercing null to 0, which would otherwise pollute the team
// average and the tier-boost score-gap check.
function requireScored(players: PrismaPlayer[]): void {
  const scoreless = players.filter((p) => p.rankScore === null);
  if (scoreless.length > 0) {
    throw new Error(
      `Cannot compute an encounter with scoreless player(s): ${scoreless.map((p) => p.name).join(', ')}`
    );
  }
}

// EloRankScoreCalculator.calculateAndPersist(Encounter).
export async function calculateAndPersistElo(encounterId: number): Promise<void> {
  const encounter = await prisma.encounter.findUniqueOrThrow({ where: { id: encounterId } });
  const team1Players = await prisma.player.findMany({ where: { id: { in: parseTeamIds(encounter.team1) } } });
  const team2Players = await prisma.player.findMany({ where: { id: { in: parseTeamIds(encounter.team2) } } });
  requireScored([...team1Players, ...team2Players]);

  const dayWideScoreGapLargeEnough = await isScoreGapLargeEnoughForDate(encounter.squadId, encounter.encounterDate);

  const result = calculateElo({
    team1AverageRankScore: team1Players.reduce((s, p) => s + p.rankScore!, 0) / team1Players.length,
    team2AverageRankScore: team2Players.reduce((s, p) => s + p.rankScore!, 0) / team2Players.length,
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
        // Safe: requireScored above already guaranteed every participant has a non-null score.
        const newRankScore = player.rankScore! + score;
        await tx.player.update({ where: { id: player.id }, data: { rankScore: newRankScore } });
        await insertScoreHistory(tx, player, encounter.id, encounter.encounterDate, player.rankScore!, newRankScore);
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

// Path 1 (CommonAbsenteeManager.calculateAbsenteeScoreAndPersist, unchanged): row-based counter,
// escalating 1x/2x/3x, auto-deactivate at 5 prior absences in the last 5 ScoreHistory rows. Must
// stay byte-identical to production for FULLTIME players - a new branch beside this one picks up
// open-slot/replacement players, not a rewrite of it.
async function applyLegacyAbsenteeLadder(player: PrismaPlayer, today: Date): Promise<void> {
  // findAllByPlayerIdOrderByEncounterDateDescIdDesc, first 5.
  const recentHistory = await prisma.scoreHistory.findMany({
    where: { playerId: player.id },
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
      await insertScoreHistory(tx, player, DISABLE_PLAYER_ENCOUNTER_ID, today, player.rankScore!, player.rankScore!);
    });
    // After the ranking transaction, never inside it - see removeDisabledPlayerFromGameDays.
    await removeDisabledPlayerFromGameDays(player.squadId, player.id);
  } else {
    const newRankScore = player.rankScore! + decision.points;
    await prisma.$transaction(async (tx) => {
      await tx.player.update({ where: { id: player.id }, data: { rankScore: newRankScore } });
      await insertScoreHistory(tx, player, ABSENTEE_ENCOUNTER_ID, today, player.rankScore!, newRankScore);
    });
  }
}

// Paths 2 & 3 (OPEN_SLOT_PLAYERS_PLAN.md): persists a demerit decision from
// decideOpenSlotAbsenteeAction / decideActiveReplacementAbsenteeAction - both use the same
// -10/-20/-30 amounts as the legacy ladder's first three steps, but neither path ever
// deactivates. See the plan's "Why neither new path deactivates" for why that matters (DISABLED
// is hard to escape, and would make any grace-days setting > 4 unreachable on the row-based
// counter anyway).
async function applyEscalatingDemerit(player: PrismaPlayer, today: Date, points: number): Promise<void> {
  const newRankScore = player.rankScore! + points;
  await prisma.$transaction(async (tx) => {
    await tx.player.update({ where: { id: player.id }, data: { rankScore: newRankScore } });
    await insertScoreHistory(tx, player, ABSENTEE_ENCOUNTER_ID, today, player.rankScore!, newRankScore);
  });
}

// CommonAbsenteeManager.calculateAbsenteeScoreAndPersist, extended for open-slot/replacement
// players (OPEN_SLOT_PLAYERS_PLAN.md - "Absentee sweep changes"). Three paths:
//   1. FULLTIME - unchanged, including a fulltime player whose slot is currently covered by a
//      replacement: "double liability for one slot" is decided-for-now (see the plan), so the
//      owner's own row is never special-cased here.
//   2. OPEN_SLOT currently *filling* an active SlotReplacement - escalating demerit clamped to
//      the window's startDate, no cutoff, no deactivation.
//   3. OPEN_SLOT with no active replacement - escalating demerit while within the squad's
//      openSlotAbsenteeGraceDays, then skipped entirely (a rolling exemption, not a one-time
//      grace period) - and never deactivated.
export async function applyAbsenteeDeductions(playerIds: number[]): Promise<void> {
  const today = todayDateOnly();

  for (const playerId of playerIds) {
    const player = await prisma.player.findUniqueOrThrow({ where: { id: playerId } });

    // Null-rankScore safety (OPEN_SLOT_PLAYERS_PLAN.md): a scoreless player has nothing to
    // deduct from and no meaningful history row to write (old_rank_score is a non-null column) -
    // this is also the correct product behavior, not merely defensive.
    if (player.rankScore === null) {
      continue;
    }

    if (player.playerType === PlayerType.FULLTIME) {
      await applyLegacyAbsenteeLadder(player, today);
      continue;
    }

    const activeReplacement = await prisma.slotReplacement.findFirst({
      where: {
        replacementPlayerId: playerId,
        cancelledAt: null,
        startDate: { lte: today },
        endDate: { gte: today },
      },
    });

    if (activeReplacement) {
      // Clamped to the window's startDate so a long-dormant nominee always starts the ramp at 1x
      // on the window's first missed day, rather than arriving pre-loaded by a dormancy spell
      // that happened before they ever claimed the slot.
      const spellDays = await absenteeSpellDays(player.squadId, playerId, today, activeReplacement.startDate);
      // Unreachable in practice - notBefore is always given here, so absenteeSpellDays only
      // returns null when the player never played *and* no clamp was given.
      if (spellDays === null) continue;
      const decision = decideActiveReplacementAbsenteeAction(spellDays);
      await applyEscalatingDemerit(player, today, decision.points);
      continue;
    }

    const spellDays = await gameDaysSinceLastPlay(player.squadId, playerId, today);
    if (spellDays === null) {
      continue; // Never played - nothing to deduct from.
    }
    const squad = await prisma.squad.findUniqueOrThrow({
      where: { id: player.squadId },
      select: { openSlotAbsenteeGraceDays: true },
    });
    const decision = decideOpenSlotAbsenteeAction(spellDays, squad.openSlotAbsenteeGraceDays);
    if (decision.action === 'skip') {
      continue; // Rolling exemption - resets the moment they play again.
    }
    await applyEscalatingDemerit(player, today, decision.points);
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
  // A scoreless player (open-slot, never played) isn't in the DISABLED/ENABLED lifecycle this
  // function reactivates from - the bulk-assign flow is how they get their first score, not
  // this route. Fail loudly rather than writing null-derived math into rank_score.
  if (player.rankScore === null) {
    throw new Error(`Player ${playerId} has no rank score yet - assign one before activating`);
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
    const activeScores = activePlayers.map((p) => p.rankScore).filter((s): s is number => s !== null);
    currentMinActiveRankScore = activeScores.length > 0 ? Math.min(...activeScores) : 0;
  }

  const newRankScore = computeActivationScore(explicitScore, {
    currentSameRankPlayerScore,
    currentMinActiveRankScore,
  });

  await prisma.$transaction(async (tx) => {
    await tx.player.update({ where: { id: player.id }, data: { playerStatus: 'ENABLED', rankScore: newRankScore } });
    await insertScoreHistory(tx, player, ACTIVATE_PLAYER_ENCOUNTER_ID, todayDateOnly(), player.rankScore!, newRankScore);
  });
}

// ScorePersister.deactivatePlayer, as called by CommonAbsenteeManager for long-term absentees
// (also usable standalone, matching the Java method's own visibility).
export async function deactivatePlayer(squadId: number, playerId: number): Promise<void> {
  const player = await prisma.player.findUniqueOrThrow({ where: { id: playerId } });
  if (player.squadId !== squadId) {
    throw new Error(`Player not found: ${playerId}`);
  }
  if (player.rankScore === null) {
    throw new Error(`Player ${playerId} has no rank score yet - nothing to deactivate`);
  }
  const today = todayDateOnly();
  await prisma.$transaction(async (tx) => {
    await tx.player.update({
      where: { id: player.id },
      data: { playerStatus: 'DISABLED', playerRank: -1, rankSince: today },
    });
    await insertScoreHistory(tx, player, DISABLE_PLAYER_ENCOUNTER_ID, today, player.rankScore!, player.rankScore!);
  });
  await removeDisabledPlayerFromGameDays(squadId, player.id);
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
