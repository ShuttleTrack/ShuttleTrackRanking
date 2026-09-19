import prisma from '@/lib/prisma';
import { encodeTeamIds, parseTeamIds } from './playerUtil';
import { calculateAndPersistElo, applyAbsenteeDeductions, updatePlayerRanking, updatePlayerEncounterNewRanking } from './scorePersister';

// Ported from backend EncounterController.java (addEncountersV2/processEncounterV2) +
// PlayerUtil.getTeamPlayerIdsStringV2 (MIGRATION_PLAN.md Phase 4).

export interface EncounterTeamInput {
  player1: number;
  player2: number;
  setPoints: number;
}

export interface AddEncounterInput {
  team1: EncounterTeamInput;
  team2: EncounterTeamInput;
  groupIndex: number | null;
  totalGroups: number | null;
}

// EncounterController.persistEncounterResultV2 / PlayerUtil.getTeamPlayerIdsStringV2. Unlike
// v1's getTeamPlayerIdsString (which resolves player *names* to ids first), v2 already takes
// ids directly - just sorted ascending and joined, no existence check against PLAYER.
export async function addEncounter(date: Date, input: AddEncounterInput) {
  return prisma.encounter.create({
    data: {
      team1: encodeTeamIds([input.team1.player1, input.team1.player2]),
      team2: encodeTeamIds([input.team2.player1, input.team2.player2]),
      encounterDate: date,
      processed: false,
      team1SetPoints: input.team1.setPoints,
      team2SetPoints: input.team2.setPoints,
      groupIndex: input.groupIndex,
      totalGroups: input.totalGroups,
    },
  });
}

// EncounterController.processEncounter: process every unprocessed encounter for a date, deduct
// absentee points from everyone who didn't play any of them, re-rank active players, and
// backfill the day's ScoreHistory rows with the resulting new ranks.
//
// UNVERIFIED ASSUMPTION, flagged rather than silently guessed: the Java version builds
// `absentPlayers` from one `findAll()` call and removes players via `List.remove(Object)`
// (default identity equals - Player has no @EqualsAndHashCode) against *separately re-fetched*
// Player instances from `playerUtil.getPlayersByIdsString` inside the per-encounter loop.
// Depending on Hibernate session/transaction boundaries this identity-based removal could
// plausibly be a no-op in the real app (meaning today's *players* might incorrectly also get
// absentee-deducted) - this was not exercised by Phase 0's characterization tests and isn't
// verifiable without a live backend. This port implements the clearly-*intended* behavior
// (value-based removal by player id, so players who played are correctly excluded from the
// absentee pass) rather than guessing at a possible identity-equality bug. Verify against the
// real backend (a real multi-encounter game-day process call) before trusting this endpoint in
// production - see MIGRATION_PLAN.md Phase 4.
export async function processEncountersForDate(date: Date): Promise<void> {
  const dayEncounters = await prisma.encounter.findMany({ where: { encounterDate: date } });
  const unprocessed = dayEncounters.filter((e) => !e.processed);
  if (unprocessed.length === 0) {
    throw new Error('No unprocessed encounters');
  }

  const allPlayers = await prisma.player.findMany();
  const absentPlayerIds = new Set(allPlayers.map((p) => p.id));

  for (const encounter of unprocessed) {
    await calculateAndPersistElo(encounter.id);
    for (const id of [...parseTeamIds(encounter.team1), ...parseTeamIds(encounter.team2)]) {
      absentPlayerIds.delete(id);
    }
  }

  await applyAbsenteeDeductions(Array.from(absentPlayerIds));

  const rankedPlayers = await updatePlayerRanking();
  for (const player of rankedPlayers) {
    // player.playerRank is always set here (just assigned by updatePlayerRanking).
    await updatePlayerEncounterNewRanking(player.id, date, player.playerRank as number);
  }
}
