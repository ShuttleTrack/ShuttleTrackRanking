package com.brs.backend.core;

import com.brs.backend.model.Player;
import com.brs.backend.model.ScoreHistory;
import com.brs.backend.repositories.EncounterRepository;
import com.brs.backend.repositories.ScoreHistoryRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static com.brs.backend.common.Constants.*;

@Service
@RequiredArgsConstructor
@Slf4j
public class CommonAbsenteeManager {

    private final ScorePersister scorePersister;

    private final EncounterRepository encounterRepository;

    private final ScoreHistoryRepository scoreHistoryRepository;

    public void calculateAbsenteeScoreAndPersist(List<Player> players) {
        var absentees = new HashMap<Player, Integer>();
        var longTermAbsentees = new ArrayList<Player>();
        for (Player player : players) {
            var games = scoreHistoryRepository.findAllByPlayerId(player.getId());
            var inactiveGamesBefore = countAbsentTimes(games);

            if (inactiveGamesBefore > 5) {
                longTermAbsentees.add(player);
            } else {
                var inactiveMultiplier = 1;
                if(inactiveGamesBefore == 1) {
                    inactiveMultiplier = 2;
                } else if(inactiveGamesBefore >= 2) {
                    inactiveMultiplier = 3;
                }
                absentees.put(player, inactiveMultiplier*DEMERIT_POINTS_ABSENTEE);
            }
        }
        deductPointsForAbsentees(absentees);
        deactivateLongTermAbsentees(longTermAbsentees);
    }

    public void deactivateLongTermAbsentees(ArrayList<Player> longTermAbsentees) {
        longTermAbsentees.forEach(player -> scorePersister.deactivatePlayer(player, DISABLE_PLAYER_ENCOUNTER_ID, LocalDate.now()));
    }

    private void deductPointsForAbsentees(Map<Player, Integer> players) {
        for(Map.Entry<Player, Integer> entry : players.entrySet()) {
            scorePersister.updatePlayer(entry.getValue(), ABSENTEE_ENCOUNTER_ID, LocalDate.now(), entry.getKey());
        }

    }

    public static int countAbsentTimes(List<ScoreHistory> scoreHistories) {
        return scoreHistories == null || scoreHistories.isEmpty() ? 0 :
                scoreHistories.stream()
                        .map(ScoreHistory::getEncounterId)
                        .takeWhile(n -> n == -1)
                        .mapToInt(n -> 1)
                        .sum();
    }

}
