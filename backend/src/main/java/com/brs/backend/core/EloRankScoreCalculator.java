package com.brs.backend.core;

import com.brs.backend.dto.PlayerStatus;
import com.brs.backend.dto.ScoreBreakdown;
import com.brs.backend.dto.TeamScoreBreakdown;
import com.brs.backend.model.Encounter;
import com.brs.backend.model.Player;
import com.brs.backend.repositories.EncounterRepository;
import com.brs.backend.repositories.PlayerRepository;
import com.brs.backend.util.PlayerUtil;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.SneakyThrows;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;

@Component
@RequiredArgsConstructor
public class EloRankScoreCalculator implements RankScoreCalculator {

    private final PlayerUtil playerUtil;

    private final ScorePersister scorePersister;

    private final CommonAbsenteeManager commonAbsenteeManager;

    private final PlayerRepository playerRepository;

    private final EncounterRepository encounterRepository;

    private final ObjectMapper objectMapper;

    private static final int K = 20;
    private static final double WIN_BOOST = 0.5;
    private static final double LOSS_SHIELD = 0.5;
    private static final double CONSOLATION_CAP = 2;
    private static final double CONSOLATION_MAX_SET_POINTS = 20;
    private static final double TIER_BOOST_MIN_SCORE_GAP = 200;

    private LocalDate cachedScoreGapDate;
    private boolean cachedScoreGapResult;

    @Override
    public void calculateAndPersist(Encounter encounter) {

        List<Player> team1Players = playerUtil.getPlayersByIdsString(encounter.getTeam1());
        List<Player> team2Players = playerUtil.getPlayersByIdsString(encounter.getTeam2());

        double team1AverageRankScore = getTeamAverageRankScore(team1Players);
        double team2AverageRankScore = getTeamAverageRankScore(team2Players);

        double team1WinExpected = 1 / (1 + Math.pow(10, ((team2AverageRankScore - team1AverageRankScore) / 480)));
        double team1WinActual = encounter.getTeam1SetPoints() > encounter.getTeam2SetPoints() ? 1 : 0;

        // K value lowered to 20 from 40 in Sep, 2024
        // K value lowered to 15 from 20 in Sep, 2025
        double team1BaseElo = round(K * (team1WinActual - team1WinExpected));
        double team2BaseElo = -1 * team1BaseElo;

        double tierFactor = getTierFactor(encounter);
        boolean scoreGapTriggered = tierFactor > 0;

        double team1TierAdj = 0;
        double team2TierAdj = 0;
        double team1Consolation = 0;
        double team2Consolation = 0;

        if (scoreGapTriggered) {
            team1TierAdj = round(applyTierMultiplier(team1BaseElo, tierFactor) - team1BaseElo);
            team2TierAdj = round(applyTierMultiplier(team2BaseElo, tierFactor) - team2BaseElo);

            double team1AfterTier = team1BaseElo + team1TierAdj;
            double team2AfterTier = team2BaseElo + team2TierAdj;

            boolean team1Lost = team1WinActual == 0;
            if (team1Lost) {
                team1Consolation = round(calculateConsolation(Math.abs(team1AfterTier), encounter.getTeam1SetPoints()));
            } else {
                team2Consolation = round(calculateConsolation(Math.abs(team2AfterTier), encounter.getTeam2SetPoints()));
            }
        }

        double team1Final = round(team1BaseElo + team1TierAdj + team1Consolation);
        double team2Final = round(team2BaseElo + team2TierAdj + team2Consolation);

        int groupIndex = encounter.getGroupIndex() != null ? encounter.getGroupIndex() : 0;
        int totalGroups = encounter.getTotalGroups() != null ? encounter.getTotalGroups() : 0;

        ScoreBreakdown breakdown = new ScoreBreakdown(
                new TeamScoreBreakdown(team1BaseElo, team1TierAdj, team1Consolation, team1Final),
                new TeamScoreBreakdown(team2BaseElo, team2TierAdj, team2Consolation, team2Final),
                groupIndex,
                totalGroups,
                tierFactor,
                scoreGapTriggered
        );

        scorePersister.persistScores(encounter.getId(), team1Final, team2Final, toJson(breakdown));

        ensurePlayersAreActive(Stream.concat(team1Players.stream(), team2Players.stream()).toList());
    }

    private double getTierFactor(Encounter encounter) {
        if (encounter.getGroupIndex() == null || encounter.getTotalGroups() == null
                || encounter.getTotalGroups() <= 1) {
            return 0.0;
        }
        if (!isScoreGapLargeEnough(encounter.getEncounterDate())) {
            return 0.0;
        }
        return (double) (encounter.getGroupIndex() - 1) / (encounter.getTotalGroups() - 1);
    }

    private boolean isScoreGapLargeEnough(LocalDate encounterDate) {
        if (encounterDate.equals(cachedScoreGapDate)) {
            return cachedScoreGapResult;
        }
        var stats = encounterRepository.findAllByEncounterDate(encounterDate).stream()
                .flatMap(e -> Stream.of(e.getTeam1(), e.getTeam2()))
                .distinct()
                .flatMap(ids -> playerUtil.getPlayersByIdsString(ids).stream())
                .mapToDouble(Player::getRankScore)
                .summaryStatistics();
        cachedScoreGapDate = encounterDate;
        cachedScoreGapResult = stats.getCount() >= 2 && (stats.getMax() - stats.getMin()) >= TIER_BOOST_MIN_SCORE_GAP;
        return cachedScoreGapResult;
    }

    private double applyTierMultiplier(double score, double tierFactor) {
        double multiplier = score > 0
                ? 1 + tierFactor * WIN_BOOST
                : 1 - tierFactor * LOSS_SHIELD;
        return round(score * multiplier);
    }

    private double calculateConsolation(double absLoss, int loserSetPoints) {
        double maxBonus = Math.min(CONSOLATION_CAP, absLoss);
        double ratio = Math.min(loserSetPoints, CONSOLATION_MAX_SET_POINTS) / CONSOLATION_MAX_SET_POINTS;
        return round(maxBonus * ratio);
    }

    @Override
    public void calculateAbsenteeScoreAndPersist(List<Player> players) {
        commonAbsenteeManager.calculateAbsenteeScoreAndPersist(players);
    }

    private double getTeamAverageRankScore(List<Player> team1Players) {
        return team1Players
                .stream()
                .mapToDouble(Player::getRankScore)
                .average().orElseThrow();
    }

    private void ensurePlayersAreActive(List<Player> players) {
        var playersToUpdate = new ArrayList<>(players);
        for(Player player : players) {
            if(!player.isActive()){
                player.setStatus(PlayerStatus.ACTIVE);
                playersToUpdate.add(player);
            }
        }
        if(!playersToUpdate.isEmpty()){
            playerRepository.saveAll(playersToUpdate);
        }
    }

    private static double round(double value) {
        return BigDecimal.valueOf(value).setScale(2, RoundingMode.HALF_UP).doubleValue();
    }

    @SneakyThrows
    private String toJson(ScoreBreakdown breakdown) {
        return objectMapper.writeValueAsString(breakdown);
    }
}
