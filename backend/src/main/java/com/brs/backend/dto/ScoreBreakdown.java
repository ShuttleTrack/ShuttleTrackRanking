package com.brs.backend.dto;

public record ScoreBreakdown(
        TeamScoreBreakdown team1,
        TeamScoreBreakdown team2,
        int groupIndex,
        int totalGroups,
        double tierFactor,
        boolean scoreGapTriggered
) {
}
