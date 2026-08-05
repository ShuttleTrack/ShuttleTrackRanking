package com.brs.backend.services;

import com.brs.backend.dto.*;
import com.brs.backend.model.Encounter;
import com.brs.backend.model.Player;
import com.brs.backend.model.ScoreHistory;
import com.brs.backend.repositories.EncounterRepository;
import com.brs.backend.repositories.PlayerRepository;
import com.brs.backend.repositories.ScoreHistoryRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class EncounterService {

    private final EncounterRepository encounterRepository;

    private final ScoreHistoryRepository scoreHistoryRepository;

    private final PlayerRepository playerRepository;

    private final ObjectMapper objectMapper;

    private static final String ENCOUNTER_SEPARATOR = ":";
    Map<Integer, Player> playerCache = new HashMap<>();

    public PlayerEncounterHistory getPlayerEncounterHistory(int playerId) {
        PlayerHistory currentPlayer = getPlayerInfo(playerId);
        if (currentPlayer == null) {
            return null;
        }
        var encountersIds = scoreHistoryRepository.findAllByPlayerId(playerId)
                .stream()
                .map(ScoreHistory::getEncounterId)
                .toList();
        var encounters = encounterRepository.findAllByIdIn(encountersIds)
                .stream()
                .sorted(Comparator.comparing(Encounter::getEncounterDate)
                        .thenComparing(Encounter::getId).reversed()).toList();
        var playerEncounterHistoryRecords = new ArrayList<PlayerEncounterHistoryRecord>();
        for (Encounter encounter : encounters) {
            List<PlayerHistory> playerTeam;
            List<PlayerHistory> opponentTeam;
            int playerTeamPoints;
            int opponentTeamPoints;
            if (getPlayerTeam(encounter, playerId) == 1) {
                playerTeam = Arrays.stream(encounter.getTeam1().split(ENCOUNTER_SEPARATOR))
                        .map(Integer::valueOf).map(this::getPlayerInfo).toList();
                opponentTeam = Arrays.stream(encounter.getTeam2().split(ENCOUNTER_SEPARATOR))
                        .map(Integer::valueOf).map(this::getPlayerInfo).toList();
                playerTeamPoints = encounter.getTeam1SetPoints();
                opponentTeamPoints = encounter.getTeam2SetPoints();
            } else {
                playerTeam = Arrays.stream(encounter.getTeam2().split(ENCOUNTER_SEPARATOR))
                        .map(Integer::valueOf).map(this::getPlayerInfo).toList();
                opponentTeam = Arrays.stream(encounter.getTeam1().split(ENCOUNTER_SEPARATOR))
                        .map(Integer::valueOf).map(this::getPlayerInfo).toList();
                playerTeamPoints = encounter.getTeam2SetPoints();
                opponentTeamPoints = encounter.getTeam1SetPoints();
            }
            var calculatedScore = encounter.getCalculatedScore();
            if (playerTeamPoints < opponentTeamPoints) {
                calculatedScore *= -1;
            }
            TeamScoreBreakdown playerBreakdown = getPlayerTeamBreakdown(encounter, playerId);
            playerEncounterHistoryRecords.add(
                    new PlayerEncounterHistoryRecord(
                            encounter.getEncounterDate(),
                            encounter.getId(),
                            calculatedScore,
                            opponentTeam,
                            opponentTeamPoints,
                            playerTeam,
                            playerTeamPoints,
                            playerBreakdown,
                            encounter.getGroupIndex(),
                            encounter.getTotalGroups()
                    ));
        }

        return new PlayerEncounterHistory(currentPlayer.getPlayerName(),
                currentPlayer.getPlayerId(), playerEncounterHistoryRecords);
    }

    public List<PlayerEncounterHistoryRecord> getPlayerEncounterHistory(Integer teamAp1, Integer teamAp2, Integer teamBp1, Integer teamBp2) {
        if (teamAp1 == null || teamAp1 == 0) {
            return Collections.emptyList();
        }
        List<PlayerEncounterHistoryRecord> encounterHistory = getPlayerEncounterHistory(teamAp1).getEncounterHistory();

        if (teamAp2 != null && teamAp2 > 0){
            encounterHistory = encounterHistory.stream()
                    .filter(e -> e.playerTeam().stream().anyMatch(w -> w.getPlayerId().equals(teamAp2)))
                    .toList();
        }

        if (teamBp1 != null && teamBp1 > 0) {
            encounterHistory = encounterHistory.stream()
                    .filter(e -> e.opponentTeam().stream().anyMatch((w -> w.getPlayerId().equals(teamBp1))))
                    .toList();
        }

        if (teamBp2 != null && teamBp2 > 0) {
            encounterHistory = encounterHistory.stream()
                    .filter(e -> e.opponentTeam().stream().anyMatch((w -> w.getPlayerId().equals(teamBp2))))
                    .toList();
        }

        return encounterHistory;
    }

    private PlayerHistory getPlayerInfo(Integer playerId) {
        var player = playerCache.computeIfAbsent(playerId, id -> playerRepository.findById(id).orElse(null));
        if (player == null) {
            return null;
        }
        return new PlayerHistory(player.getName(), playerId);
    }

    private TeamScoreBreakdown getPlayerTeamBreakdown(Encounter encounter, int playerId) {
        if (encounter.getScoreBreakdown() == null) {
            return null;
        }
        try {
            ScoreBreakdown breakdown = objectMapper.readValue(encounter.getScoreBreakdown(), ScoreBreakdown.class);
            return getPlayerTeam(encounter, playerId) == 1 ? breakdown.team1() : breakdown.team2();
        } catch (Exception e) {
            log.warn("Failed to parse score breakdown for encounter {}", encounter.getId(), e);
            return null;
        }
    }

    private int getPlayerTeam(Encounter encounter, Integer playerId) {
        if (Arrays.stream(encounter.getTeam1().split(ENCOUNTER_SEPARATOR))
                .anyMatch(p -> Integer.valueOf(p).equals(playerId))) {
            return 1;
        } else
            return 2;
    }
}
