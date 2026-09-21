import type { Player as PrismaPlayer, ScoreHistory as PrismaScoreHistory } from '@prisma/client';
import { PlayerType } from '@prisma/client';
import prisma from '@/lib/prisma';
import { derivePlayerStatus, filterPlayersByStatusParam, isActive, RawPlayerStatus } from './playerStatus';
import { timeInHighestRankLabel } from './period';
import { getRankedPlayers } from './playerUtil';

// Ported from backend PlayerService.java + ScoreHistoryService.java (MIGRATION_PLAN.md Phase 2).
// Field names match the real Java DTOs (PlayerInfo / SecurePlayerInfo / PlayerRankHistory /
// PlayerScoreHistory / PlayerFlatHistory) exactly, since that's the JSON shape the frontend
// already consumes from the Java backend today.

export interface PlayerInfo {
  id: number;
  name: string;
  rankScore: number | null;
  playerRank: number | null;
  previousRank: number | null;
  colorHex: string;
  highestRank: number | null;
  // null in the real API response for PlayerService.addPlayer's `convert()` (never computed
  // there), a real string everywhere else. Preserved rather than always defaulting to "".
  timeInHighestRank: string | null;
  status: RawPlayerStatus;
  playerType: PlayerType;
}

export interface SecurePlayerInfo extends PlayerInfo {
  email: string;
}

export type HistoryType = 'RANK' | 'SCORE' | 'ALL';

export interface RankHistoryItem {
  date: string;
  oldRank: number | null;
  newRank: number | null;
}

export interface ScoreHistoryItem {
  encounterId: number;
  encounterDate: string;
  oldRankScore: number;
  newRankScore: number;
}

export interface FlatHistoryItem {
  encounterId: number;
  encounterDate: string;
  oldRank: number | null;
  newRank: number | null;
  oldRankScore: number;
  newRankScore: number;
}

export interface PlayerHistoryResponse<T> {
  playerName: string;
  playerId: number;
  history: T[];
}

// PlayerService.getMaxRank: when a player has no score history at all, previousRank falls
// back to their current playerRank rather than being null.
function mostRecentPlayerOldRank(player: PrismaPlayer, mostRecent: PrismaScoreHistory | null): number | null {
  return mostRecent ? mostRecent.playerOldRank : player.playerRank;
}

function toDateOnlyString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function todayDateOnly(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// PlayerService.getPlayerInfoByStatus mapping (one player).
export function toPlayerInfo(player: PrismaPlayer, mostRecentScoreHistory: PrismaScoreHistory | null): PlayerInfo {
  const active = isActive(player);
  return {
    id: player.id,
    name: player.name,
    rankScore: active ? player.rankScore : null,
    playerRank: active ? player.playerRank : null,
    previousRank: mostRecentPlayerOldRank(player, mostRecentScoreHistory),
    colorHex: player.colorHex,
    highestRank: player.highestRank,
    timeInHighestRank: timeInHighestRankLabel(player.rankSince),
    status: derivePlayerStatus(player),
    playerType: player.playerType,
  };
}

export function toSecurePlayerInfo(
  player: PrismaPlayer,
  mostRecentScoreHistory: PrismaScoreHistory | null
): SecurePlayerInfo {
  return { ...toPlayerInfo(player, mostRecentScoreHistory), email: player.email };
}

async function mostRecentScoreHistoryFor(playerId: number): Promise<PrismaScoreHistory | null> {
  // Mirrors ScoreHistoryRepository.findFirstByPlayerIdOrderByEncounterDateDesc exactly: no
  // secondary sort key, so ties on encounterDate have no defined order (same as the original).
  return prisma.scoreHistory.findFirst({
    where: { playerId },
    orderBy: { encounterDate: 'desc' },
  });
}

// GET /players ?status=
export async function getPlayers(squadId: number, status?: string): Promise<PlayerInfo[]> {
  const allPlayers = await prisma.player.findMany({ where: { squadId } });
  const eligible = filterPlayersByStatusParam(allPlayers, status);
  return Promise.all(
    eligible.map(async (player) => toPlayerInfo(player, await mostRecentScoreHistoryFor(player.id)))
  );
}

// GET /v2/auth/players ?status=
export async function getSecurePlayers(squadId: number, status?: string): Promise<SecurePlayerInfo[]> {
  const allPlayers = await prisma.player.findMany({ where: { squadId } });
  const eligible = filterPlayersByStatusParam(allPlayers, status);
  return Promise.all(
    eligible.map(async (player) => toSecurePlayerInfo(player, await mostRecentScoreHistoryFor(player.id)))
  );
}

// Ported from ScoreHistoryService.getPlayerHistory. Duplicates are collapsed (Java: Collectors.
// toSet() on the record, which dedups on every field) and the result is sorted - by date for
// RANK, by encounterId for SCORE/ALL. Preserve both: the dedup is intentional (collapses
// identical rank transitions recorded from separate encounters on the same day, e.g. two
// matches with the same score-tier outcome) and the sort key differs by type.
export function buildPlayerHistory(
  playerName: string,
  playerId: number,
  scoreHistoryRows: PrismaScoreHistory[],
  type: HistoryType
): PlayerHistoryResponse<RankHistoryItem | ScoreHistoryItem | FlatHistoryItem> {
  if (type === 'RANK') {
    const items = dedupeByKey(
      scoreHistoryRows.map(
        (e): RankHistoryItem => ({
          date: toDateOnlyString(e.encounterDate),
          oldRank: e.playerOldRank,
          newRank: e.playerNewRank,
        })
      ),
      (i) => `${i.date}|${i.oldRank}|${i.newRank}`
    ).sort((a, b) => a.date.localeCompare(b.date));
    return { playerName, playerId, history: items };
  }

  if (type === 'SCORE') {
    const items = dedupeByKey(
      scoreHistoryRows.map(
        (e): ScoreHistoryItem => ({
          encounterId: e.encounterId,
          encounterDate: toDateOnlyString(e.encounterDate),
          oldRankScore: e.oldRankScore,
          newRankScore: e.newRankScore,
        })
      ),
      (i) => `${i.encounterId}|${i.encounterDate}|${i.oldRankScore}|${i.newRankScore}`
    ).sort((a, b) => a.encounterId - b.encounterId);
    return { playerName, playerId, history: items };
  }

  // ALL
  const items = dedupeByKey(
    scoreHistoryRows.map(
      (e): FlatHistoryItem => ({
        encounterId: e.encounterId,
        encounterDate: toDateOnlyString(e.encounterDate),
        oldRank: e.playerOldRank,
        newRank: e.playerNewRank,
        oldRankScore: e.oldRankScore,
        newRankScore: e.newRankScore,
      })
    ),
    (i) => `${i.encounterId}|${i.encounterDate}|${i.oldRank}|${i.newRank}|${i.oldRankScore}|${i.newRankScore}`
  ).sort((a, b) => a.encounterId - b.encounterId);
  return { playerName, playerId, history: items };
}

function dedupeByKey<T>(items: T[], keyOf: (item: T) => string): T[] {
  const seen = new Map<string, T>();
  for (const item of items) {
    seen.set(keyOf(item), item);
  }
  return Array.from(seen.values());
}

// GET /players/history ?type= (defaults RANK) - only active players, per PlayerController.
export async function getAllPlayersHistory(squadId: number, type: HistoryType = 'RANK') {
  const allPlayers = await prisma.player.findMany({ where: { squadId } });
  const activePlayers = allPlayers.filter(isActive);
  return Promise.all(
    activePlayers.map(async (player) => {
      const rows = await prisma.scoreHistory.findMany({ where: { playerId: player.id } });
      return buildPlayerHistory(player.name, player.id, rows, type);
    })
  );
}

// GET /players/{playerId}/history ?type= (defaults RANK). No not-found handling in the
// original (player.orElseThrow()) - mirrors that by letting a missing player throw. squadId is
// required so a squad-scoped route can't be used to pull another squad's player history by
// guessing a player id - player ids are a shared, globally-unique sequence across all squads.
export async function getPlayerHistory(squadId: number, playerId: number, type: HistoryType = 'RANK') {
  const player = await prisma.player.findUnique({ where: { id: playerId } });
  if (!player || player.squadId !== squadId) {
    throw new Error(`Player not found: ${playerId}`);
  }
  const rows = await prisma.scoreHistory.findMany({ where: { playerId } });
  return buildPlayerHistory(player.name, player.id, rows, type);
}

// ---------------------------------------------------------------- Phase 4: write endpoints

function generateRandomColorHex(): string {
  return Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, '0');
}

export interface NewPlayerInput {
  name: string;
  // Required for FULLTIME (unchanged - the add-player route still rejects a missing/non-positive
  // score for that type). Optional for OPEN_SLOT: OPEN_SLOT_PLAYERS_PLAN.md's whole point is that
  // an open-slot player may be added, or self-register in future, before anyone has seen them
  // play - the game-planner's bulk-assign step is where they get a score later.
  initialScore?: number;
  // Required going forward (SQUAD_TENANCY_PLAN.md) - email is the only link between a login and
  // a role in a squad.
  email: string;
  playerType?: PlayerType;
}

// PlayerService.addPlayer: POST /v2/players. Note the real Java return type declares
// `PlayerInfo` but the method body actually returns a `SecurePlayerInfo` (covariant return) -
// Jackson serializes the *runtime* object, so `email` genuinely is present in the real
// response despite the narrower declared type. `previousRank` is the player's own brand-new
// rank (not looked up from history) and `timeInHighestRank` is left unset - preserved exactly.
export async function addPlayer(squadId: number, input: NewPlayerInput): Promise<SecurePlayerInfo> {
  const squad = await prisma.squad.findUniqueOrThrow({ where: { id: squadId } });
  if (squad.maxPlayers !== null) {
    const currentCount = await prisma.player.count({ where: { squadId } });
    if (currentCount >= squad.maxPlayers) {
      throw new Error(`Squad is at its player limit (${squad.maxPlayers})`);
    }
  }

  const playerType = input.playerType ?? PlayerType.FULLTIME;
  const hasScore = input.initialScore !== undefined && input.initialScore !== null;

  // A brand-new squad has no players yet, unlike the single-squad original this was ported from
  // (which could always assume at least one existing player) - guard the empty case explicitly.
  // Only needed when this player is getting a score/rank now - a scoreless open-slot player has
  // no meaningful rank yet, so playerRank/highestRank/rankSince stay null until the bulk-assign
  // step (or a future self-service score) gives them one.
  let newRank: number | null = null;
  if (hasScore) {
    const activePlayers = await prisma.player.findMany({ where: { squadId, playerStatus: 'ACTIVE' } });
    newRank =
      activePlayers.length === 0
        ? 1
        : (activePlayers.reduce((max, p) => ((p.playerRank ?? -Infinity) > (max.playerRank ?? -Infinity) ? p : max))
            .playerRank ?? 0) + 1;
  }

  const player = await prisma.player.create({
    data: {
      squadId,
      name: input.name,
      playerType,
      playerRank: newRank,
      highestRank: newRank,
      rankScore: hasScore ? input.initialScore! : null,
      rankSince: hasScore ? new Date() : null,
      colorHex: generateRandomColorHex(),
      email: input.email.toLowerCase(),
    },
  });

  return {
    id: player.id,
    name: player.name,
    rankScore: player.rankScore,
    playerRank: player.playerRank,
    previousRank: player.playerRank,
    colorHex: player.colorHex,
    highestRank: player.highestRank,
    timeInHighestRank: null,
    status: derivePlayerStatus(player),
    email: player.email,
    playerType: player.playerType,
  };
}

export interface UpdatePlayerInput {
  id: number;
  name?: string;
  email?: string;
}

// PlayerService.updatePlayer: PUT /v2/players/{id}. Returns plain PlayerInfo (no email, even
// though email may have just been updated) with `timeInHighestRank` hardcoded to "0 day(s)"
// rather than computed - both preserved exactly as quirks of the original. squadId is required
// so a squad-scoped route can't be used to update another squad's player by guessing an id.
export async function updatePlayer(squadId: number, input: UpdatePlayerInput): Promise<PlayerInfo> {
  const existing = await prisma.player.findUniqueOrThrow({ where: { id: input.id } });
  if (existing.squadId !== squadId) {
    throw new Error(`Player not found: ${input.id}`);
  }
  const data: { name?: string; email?: string } = {};
  if (input.name !== undefined && input.name !== null) data.name = input.name;
  if (input.email !== undefined && input.email !== null) data.email = input.email.toLowerCase();

  const player = Object.keys(data).length > 0
    ? await prisma.player.update({ where: { id: input.id }, data })
    : existing;

  return {
    id: player.id,
    name: player.name,
    rankScore: player.rankScore,
    playerRank: player.playerRank,
    previousRank: player.playerRank,
    colorHex: player.colorHex,
    highestRank: player.highestRank,
    timeInHighestRank: '0 day(s)',
    status: derivePlayerStatus(player),
    playerType: player.playerType,
  };
}

export interface GamePlayer {
  id: number;
  rank: number;
  // OPEN_SLOT_PLAYERS_PLAN.md - "Game-planner player selection UI": lets the picker group
  // FULLTIME + currently-active-replacement players together, separately from plain open-slot
  // players, and flag scoreless rows before the admin hits the bulk-assign wall.
  playerType: PlayerType;
  isActiveReplacement: boolean;
  hasScore: boolean;
}

// GameService.getAvailablePlayersForGame: GET /v2/game/players. Ranked list (by rankScore desc,
// current playerRank asc tiebreak, nulls sorted last per getRankedPlayers) of every non-disabled
// player, with a fresh sequential game-day rank (distinct from their persisted `playerRank`).
export async function getAvailablePlayersForGame(squadId: number): Promise<GamePlayer[]> {
  const allPlayers = await prisma.player.findMany({ where: { squadId } });
  const available = allPlayers.filter((p) => p.playerStatus !== 'DISABLED');
  const ranked = getRankedPlayers(available.map((p) => ({ ...p, playerRank: p.playerRank ?? 0 })));

  const today = todayDateOnly();
  const activeReplacements = await prisma.slotReplacement.findMany({
    where: { squadId, cancelledAt: null, startDate: { lte: today }, endDate: { gte: today } },
    select: { replacementPlayerId: true },
  });
  const activeReplacementPlayerIds = new Set(activeReplacements.map((r) => r.replacementPlayerId));

  return ranked.map((player, index) => ({
    id: player.id,
    rank: index + 1,
    playerType: player.playerType,
    isActiveReplacement: activeReplacementPlayerIds.has(player.id),
    hasScore: player.rankScore !== null,
  }));
}

// OPEN_SLOT_PLAYERS_PLAN.md "Null-rankScore safety" item 2: the authoritative gate against a
// scoreless player reaching the Elo math is here, not the game-planner's client-side bulk-assign
// panel (which is just the friendly path to satisfying this). Called from the game-create/update
// API routes before groups are persisted.
export async function findScorelessPlayersInGroups(
  squadId: number,
  groups: Record<string, number[]>
): Promise<{ id: number; name: string }[]> {
  const ids = Array.from(new Set(Object.values(groups).flat()));
  if (ids.length === 0) return [];
  const players = await prisma.player.findMany({
    where: { id: { in: ids }, squadId },
    select: { id: true, name: true, rankScore: true },
  });
  return players.filter((p) => p.rankScore === null).map((p) => ({ id: p.id, name: p.name }));
}

export interface RawPlayerJson {
  id: number;
  name: string;
  rankScore: number | null;
  playerRank: number | null;
  colorHex: string;
  highestRank: number | null;
  rankSince: string | null;
  status: string | null;
  email: string;
  // Jackson auto-detects `isXxx()` boolean getters as bean properties, so the real Java
  // `List<Player>` response (POST /v2/players/update-ranking - the entity, not a DTO) actually
  // includes these three derived fields too, not just the raw columns.
  availableForGame: boolean;
  active: boolean;
  disabled: boolean;
}

// Raw JPA `Player` entity as Jackson would serialize it (used only where the backend genuinely
// returns the entity directly, e.g. POST /v2/players/update-ranking) - see playerStatus.ts for
// the isActive/isDisabled/isAvailableForGame semantics being mirrored here.
export function toRawPlayerJson(player: PrismaPlayer): RawPlayerJson {
  return {
    id: player.id,
    name: player.name,
    rankScore: player.rankScore,
    playerRank: player.playerRank,
    colorHex: player.colorHex,
    highestRank: player.highestRank,
    rankSince: player.rankSince ? player.rankSince.toISOString().slice(0, 10) : null,
    status: player.playerStatus,
    email: player.email,
    availableForGame: player.playerStatus !== 'DISABLED',
    active: player.playerStatus === 'ACTIVE',
    disabled: player.playerStatus === 'DISABLED',
  };
}
