interface ScoreUpdate {
  gameId: string;
  groupName: string;
  matchIndex: number;
  team1Score: number;
  team2Score: number;
}

export const userScoreService = {
  submitScore: async (squadId: number, data: ScoreUpdate): Promise<void> => {
    const response = await fetch(`/api/squads/${squadId}/user/scores`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to submit score');
    }
  }
};
