package com.brs.backend.dto;

import java.time.LocalDate;
import java.util.List;

public record PlayerEncounterHistoryRecord(LocalDate encounterDate,
                                           Integer encounterId,
                                           Double encounterScore,
                                           List<PlayerHistory> opponentTeam,
                                           Integer opponentTeamPoints,
                                           List<PlayerHistory> playerTeam,
                                           Integer playerTeamPoints,
                                           TeamScoreBreakdown scoreBreakdown,
                                           Integer groupIndex,
                                           Integer totalGroups) {
}
