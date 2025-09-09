package com.brs.backend.core;

import com.brs.backend.dto.PlayerStatus;
import com.brs.backend.model.Encounter;
import com.brs.backend.model.Player;
import com.brs.backend.repositories.PlayerRepository;
import com.brs.backend.util.PlayerUtil;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
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
        double team1Score = BigDecimal.valueOf(20 * (team1WinActual - team1WinExpected)).setScale(2, RoundingMode.HALF_UP).doubleValue();
        double team2Score = -1 * team1Score;

        scorePersister.persistScores(encounter.getId(), team1Score, team2Score);

        ensurePlayersAreActive(Stream.concat(team1Players.stream(), team2Players.stream()).toList());

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
