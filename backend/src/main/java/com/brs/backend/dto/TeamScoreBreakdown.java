package com.brs.backend.dto;

public record TeamScoreBreakdown(
        double baseElo,
        double tierAdjustment,
        double consolation,
        double finalScore
) {
}
