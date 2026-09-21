import type { Game } from '@prisma/client';

export interface GameInput {
  groups: Record<string, number[]>;
  scores?: Record<string, Record<string, MatchScore>>;
  status?: 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED';
}

interface MatchScore {
  team1Score: number;
  team2Score: number;
  submitted?: boolean;
}

// The create/update routes reject a group containing a scoreless player with a 400 that names
// them (OPEN_SLOT_PLAYERS_PLAN.md's server-side gate) - that message is the whole point of the
// gate, so pass it through instead of flattening every failure to a fixed string.
async function failureMessage(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => null);
  return body && typeof body.message === 'string' ? body.message : fallback;
}

// Not a hook, so squadId is passed explicitly by every caller rather than read from
// SquadContext (see hooks/*.ts for the equivalent read-side pattern).
export const gameService = {
  createGame: async (squadId: number, data: GameInput): Promise<Game> => {
    const response = await fetch(`/api/squads/${squadId}/games`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error(await failureMessage(response, 'Failed to create game'));
    return response.json();
  },

  getGame: async (squadId: number, id: string): Promise<Game> => {
    const response = await fetch(`/api/squads/${squadId}/games/${id}`);
    if (!response.ok) throw new Error('Failed to fetch game');
    return response.json();
  },

  updateGame: async (squadId: number, id: string, data: Partial<GameInput>): Promise<Game> => {
    const response = await fetch(`/api/squads/${squadId}/games/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error(await failureMessage(response, 'Failed to update game'));
    return response.json();
  },

  deleteGame: async (squadId: number, id: string): Promise<void> => {
    const response = await fetch(`/api/squads/${squadId}/games/${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete game');
  },

  startGame: async (squadId: number, id: string): Promise<Game> => {
    const response = await fetch(`/api/squads/${squadId}/games/${id}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) throw new Error('Failed to start game');
    return response.json();
  },

  submitGame: async (squadId: number, id: string): Promise<Game> => {
    const response = await fetch(`/api/squads/${squadId}/games/${id}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) throw new Error('Failed to submit game');
    return response.json();
  },

  processGame: async (squadId: number, id: string): Promise<Game> => {
    const response = await fetch(`/api/squads/${squadId}/games/${id}/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) throw new Error('Failed to process game');
    return response.json();
  },
};
