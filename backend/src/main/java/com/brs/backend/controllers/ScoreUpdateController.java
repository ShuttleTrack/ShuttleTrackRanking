package com.brs.backend.controllers;

import com.brs.backend.core.ScorePersister;
import com.brs.backend.repositories.PlayerRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.*;

import static com.brs.backend.common.Constants.COMPRESS_SCORE_ENCOUNTER_ID;

@RestController
@RequiredArgsConstructor
public class ScoreUpdateController {

    private final PlayerRepository playerRepository;

    private final ScorePersister scorePersister;

    @PostMapping("/score/compress")
    public void compressScores() {
        var players = playerRepository.findAll();
        var playerScoresMap = new HashMap<Integer, Double>();
        players.forEach(player -> {
            playerScoresMap.put(player.getId(), player.getRankScore());
        });
        var compressedScores = convergeScores(playerScoresMap, 37.5);

        compressedScores.forEach((playerId, newScore) -> {
            scorePersister.updatePlayerWithScore(newScore, COMPRESS_SCORE_ENCOUNTER_ID, LocalDate.now(), playerId);
        });
    }

    private Map<Integer, Double> convergeScores(Map<Integer, Double> idToScore, double percentile) {
        if (idToScore == null || idToScore.size() < 2 || percentile < 0 || percentile > 100) {
            throw new IllegalArgumentException("Invalid input parameters");
        }

        // Create sorted entries by score
        List<Map.Entry<Integer, Double>> sortedEntries = idToScore.entrySet()
                .stream()
                .sorted(Map.Entry.comparingByValue())
                .toList();

        // Calculate initial differences between adjacent scores
        double[] initialDifferences = new double[sortedEntries.size() - 1];
        double initialTotalDiff = 0;
        for (int i = 0; i < sortedEntries.size() - 1; i++) {
            initialDifferences[i] = sortedEntries.get(i + 1).getValue() - sortedEntries.get(i).getValue();
            initialTotalDiff += initialDifferences[i];
        }
        double initialAverageDiff = initialTotalDiff / initialDifferences.length;

        // Calculate the target value m (percentile of differences)
        double[] sortedDiffs = Arrays.copyOf(initialDifferences, initialDifferences.length);
        Arrays.sort(sortedDiffs);
        int percentileIndex = (int) Math.ceil((percentile / 100.0) * sortedDiffs.length) - 1;
        if (percentileIndex < 0) percentileIndex = 0;
        double m = sortedDiffs[percentileIndex];
        double targetAverageDiff = 2 * m;

        // Calculate scaling factor to achieve target average difference
        double scalingFactor = targetAverageDiff / initialAverageDiff;

        // Create temporary map for converged scores
        Map<Integer, Double> convergedScores = new HashMap<>();

        // Add first entry as is
        Map.Entry<Integer, Double> firstEntry = sortedEntries.get(0);
        convergedScores.put(firstEntry.getKey(), firstEntry.getValue());

        // Build converged scores by scaling differences
        for (int i = 1; i < sortedEntries.size(); i++) {
            Integer currentId = sortedEntries.get(i).getKey();
            double previousScore = convergedScores.get(sortedEntries.get(i - 1).getKey());
            double originalDiff = initialDifferences[i - 1];
            // Scale the difference while preserving relative proportions
            double newDiff = originalDiff * scalingFactor;
            convergedScores.put(currentId, previousScore + newDiff);
        }

        // Return a new TreeMap sorted by ID
        return new TreeMap<>(convergedScores);
    }
}
