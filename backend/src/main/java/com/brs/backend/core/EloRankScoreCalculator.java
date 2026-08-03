package com.brs.backend.core;

import com.brs.backend.dto.PlayerStatus;
import com.brs.backend.model.Encounter;
import com.brs.backend.model.Player;
import com.brs.backend.repositories.EncounterRepository;
import com.brs.backend.repositories.PlayerRepository;
import com.brs.backend.util.PlayerUtil;
import lombok.RequiredArgsConstructor;
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

    private static final int K = 20;
    private static final double WIN_BOOST = 0.5;
    private static final double LOSS_SHIELD = 0.5;
    private static final double TIER_BOOST_MIN_SCORE_GAP = 200;

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
        double team1Score = BigDecimal.valueOf(K * (team1WinActual - team1WinExpected)).setScale(2, RoundingMode.HALF_UP).doubleValue();
        double team2Score = -1 * team1Score;

        double tierMultiplier = getTierMultiplier(encounter);
        if (tierMultiplier != 1.0) {
            team1Score = applyTierMultiplier(team1Score, tierMultiplier);
            team2Score = applyTierMultiplier(team2Score, tierMultiplier);
        }

        scorePersister.persistScores(encounter.getId(), team1Score, team2Score);

        ensurePlayersAreActive(Stream.concat(team1Players.stream(), team2Players.stream()).toList());

    }

    private double getTierMultiplier(Encounter encounter) {
        if (encounter.getGroupIndex() == null || encounter.getTotalGroups() == null
                || encounter.getTotalGroups() <= 1) {
            return 1.0;
        }
        if (!isScoreGapLargeEnough(encounter.getEncounterDate())) {
            return 1.0;
        }
        return (double) (encounter.getGroupIndex() - 1) / (encounter.getTotalGroups() - 1);
    }

    private boolean isScoreGapLargeEnough(LocalDate encounterDate) {
        var stats = encounterRepository.findAllByEncounterDate(encounterDate).stream()
                .flatMap(e -> Stream.of(e.getTeam1(), e.getTeam2()))
                .distinct()
                .flatMap(ids -> playerUtil.getPlayersByIdsString(ids).stream())
                .mapToDouble(Player::getRankScore)
                .summaryStatistics();
        return stats.getCount() >= 2 && (stats.getMax() - stats.getMin()) >= TIER_BOOST_MIN_SCORE_GAP;
    }

    private double applyTierMultiplier(double score, double tierFactor) {
        double multiplier = score > 0
                ? 1 + tierFactor * WIN_BOOST
                : 1 - tierFactor * LOSS_SHIELD;
        return BigDecimal.valueOf(score * multiplier).setScale(2, RoundingMode.HALF_UP).doubleValue();
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
}
