// Ported from backend Player.java (isActive/isDisabled/isAvailableForGame) and
// PlayerService.java (getPlayerStatus, getPlayerListByStatus). See MIGRATION_PLAN.md Phase 2.
//
// `playerStatus` is a free-form nullable varchar in the DB (Hibernate `@Enumerated(STRING)`),
// not a real SQL enum - treat anything that isn't exactly "ACTIVE" or "DISABLED" (including
// null, "ENABLED", or an unrecognized value) the same way the Java booleans would.

export type RawPlayerStatus = 'ACTIVE' | 'ENABLED' | 'DISABLED';

export interface PlayerStatusFields {
  playerStatus: string | null;
}

export function isActive(player: PlayerStatusFields): boolean {
  return player.playerStatus === 'ACTIVE';
}

export function isDisabled(player: PlayerStatusFields): boolean {
  return player.playerStatus === 'DISABLED';
}

export function isAvailableForGame(player: PlayerStatusFields): boolean {
  return player.playerStatus !== 'DISABLED';
}

// PlayerService.getPlayerStatus: the *derived* 3-state status used in API responses.
// ACTIVE if isActive(); else ENABLED if isAvailableForGame() (covers null/ENABLED); else DISABLED.
export function derivePlayerStatus(player: PlayerStatusFields): RawPlayerStatus {
  if (isActive(player)) return 'ACTIVE';
  if (isAvailableForGame(player)) return 'ENABLED';
  return 'DISABLED';
}

// PlayerService.getPlayerListByStatus: case-insensitive filter param semantics.
// Empty/blank/"ALL"/unrecognized -> everyone. "INACTIVE" -> disabled. "ACTIVE" -> active.
// "ENABLED" -> available for game (not disabled).
export function filterPlayersByStatusParam<T extends PlayerStatusFields>(
  players: T[],
  status: string | undefined
): T[] {
  const normalized = status?.trim().toUpperCase();
  if (!normalized || normalized === 'ALL') return players;
  if (normalized === 'INACTIVE') return players.filter(isDisabled);
  if (normalized === 'ACTIVE') return players.filter(isActive);
  if (normalized === 'ENABLED') return players.filter((p) => isAvailableForGame(p) && !isDisabled(p));
  return players;
}
