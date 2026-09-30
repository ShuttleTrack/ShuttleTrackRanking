export const isValidPlayerCount = (count: number) => {
  const MIN_PLAYERS = 4;
  const MAX_PLAYERS = 20;
  const MAX_GROUPS = 4;
  const MIN_GROUP_SIZE = 4;
  const MAX_GROUP_SIZE = 5;

  if (count < MIN_PLAYERS || count > MAX_PLAYERS) return false;

  // 20 players are split into 5 groups of 4 (groups of 4 preferred), the one
  // case allowed to exceed MAX_GROUPS.
  const maxGroups = count === MAX_PLAYERS ? 5 : MAX_GROUPS;

  for (let numGroups = 1; numGroups <= maxGroups; numGroups++) {
    const minPlayersNeeded = numGroups * MIN_GROUP_SIZE;
    const maxPlayersNeeded = numGroups * MAX_GROUP_SIZE;
    if (count >= minPlayersNeeded && count <= maxPlayersNeeded) {
      return true;
    }
  }
  return false;
}; 