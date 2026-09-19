package com.brs.backend.core;

import com.brs.backend.dto.PlayerStatus;
import com.brs.backend.model.Encounter;
import com.brs.backend.model.Player;
import com.brs.backend.model.ScoreHistory;
import com.brs.backend.repositories.EncounterRepository;
import com.brs.backend.repositories.PlayerRepository;
import com.brs.backend.repositories.ScoreHistoryRepository;
import com.brs.backend.util.PlayerUtil;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static com.brs.backend.common.Constants.ABSENTEE_ENCOUNTER_ID;
import static com.brs.backend.common.Constants.DEMERIT_POINTS_ABSENTEE;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Phase 0 of MIGRATION_PLAN.md: not a regression test (no expected-output assertions on the
 * math itself) but a HARNESS that exercises the real, currently-deployed Elo/absentee/activation
 * logic through Mockito-mocked repositories (no live BE/DB available to hit directly) and
 * captures its actual output into a fixture file. That fixture is the oracle the TypeScript port
 * (Phase 3+) must reproduce bit-for-bit.
 * <p>
 * Deliberately NOT named *Test/*Tests/*TestCase so Surefire's default include pattern skips it
 * during normal {@code mvn test} / CI runs. Run explicitly to (re)generate fixtures:
 * {@code mvn test -Dtest=CharacterizationFixtureGenerator}
 */
class CharacterizationFixtureGenerator {

    private static final LocalDate DAY = LocalDate.of(2026, 9, 14);
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void generateCharacterizationFixtures() throws IOException {
        List<Map<String, Object>> eloScenarios = new ArrayList<>();
        eloScenarios.add(scenarioNormalCloseWin());
        eloScenarios.add(scenarioNormalUpsetLoss());
        eloScenarios.add(scenarioTierWinBoost());
        eloScenarios.add(scenarioTierLossConsolationCapped());
        eloScenarios.add(scenarioTierLossConsolationNotCapped());
        eloScenarios.add(scenarioTierNotTriggeredGapBelow200());
        eloScenarios.add(scenarioTierNotTriggeredSingleGroup());

        List<Map<String, Object>> absenteeScenarios = new ArrayList<>();
        absenteeScenarios.add(runAbsenteeScenario("absentee_0_prior",
                "No absences in last 5 games -> 1x multiplier", 0, player(201, 1000)));
        absenteeScenarios.add(runAbsenteeScenario("absentee_1_prior",
                "1 absence in last 5 games -> 2x multiplier", 1, player(202, 1000)));
        absenteeScenarios.add(runAbsenteeScenario("absentee_2_prior",
                "2 absences in last 5 games -> 3x multiplier", 2, player(203, 1000)));
        absenteeScenarios.add(runAbsenteeScenario("absentee_4_prior",
                "4 absences in last 5 games -> still 3x multiplier (boundary below deactivation)", 4, player(204, 1000)));
        absenteeScenarios.add(runAbsenteeScenario("absentee_5_prior",
                "5 absences in last 5 games -> long-term auto-deactivation instead of demerit", 5, player(205, 1000)));

        List<Map<String, Object>> activationScenarios = new ArrayList<>();
        activationScenarios.add(runActivateExplicitScoreScenario());
        activationScenarios.add(runActivateAutoWithRankMatchScenario());
        activationScenarios.add(runActivateAutoFallbackToMinScenario());

        Map<String, Object> constants = new LinkedHashMap<>();
        constants.put("K", 20);
        constants.put("WIN_BOOST", 0.5);
        constants.put("LOSS_SHIELD", 0.5);
        constants.put("CONSOLATION_CAP", 2);
        constants.put("CONSOLATION_MAX_SET_POINTS", 20);
        constants.put("TIER_BOOST_MIN_SCORE_GAP", 200);
        constants.put("DEMERIT_POINTS_ABSENTEE", DEMERIT_POINTS_ABSENTEE);
        constants.put("ABSENTEE_ENCOUNTER_ID", ABSENTEE_ENCOUNTER_ID);
        constants.put("_note", "K's inline comment in EloRankScoreCalculator claims it was lowered "
                + "20->15 in Sep 2025, but git history (commit ed5f289) shows only the comment was "
                + "added then - the literal stayed hardcoded at 20 in that same diff and has never "
                + "been changed. K has been 20 continuously since Sep 2024, confirmed live (main is "
                + "the deployed branch). Captured against 20; the comment is stale, not the code.");

        Map<String, Object> root = new LinkedHashMap<>();
        root.put("_generatedFrom", "backend/src/main/java/com/brs/backend/core (EloRankScoreCalculator, "
                + "ScorePersister, CommonAbsenteeManager) via CharacterizationFixtureGenerator - "
                + "see MIGRATION_PLAN.md Phase 0");
        root.put("constants", constants);
        root.put("eloScenarios", eloScenarios);
        root.put("absenteeScenarios", absenteeScenarios);
        root.put("activationScenarios", activationScenarios);

        Path outPath = Path.of("..", "frontend", "src", "lib", "ranking", "__fixtures__", "characterization.json");
        Files.createDirectories(outPath.getParent());
        Files.writeString(outPath, objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(root));

        assertThat(eloScenarios).hasSize(7);
        assertThat(absenteeScenarios).hasSize(5);
        assertThat(activationScenarios).hasSize(3);
    }

    // ---------------------------------------------------------------- Elo scenarios

    private Map<String, Object> scenarioNormalCloseWin() {
        Map<Integer, Player> players = playersById(
                player(1, 1500), player(2, 1500), player(3, 1500), player(4, 1500));
        return runEloScenario("normal_close_win",
                "No group/tier info, evenly matched teams, team1 wins a normal set.",
                players, "1:2", "3:4", 21, 15, null, null, null);
    }

    private Map<String, Object> scenarioNormalUpsetLoss() {
        Map<Integer, Player> players = playersById(
                player(5, 1700), player(6, 1700), player(7, 1300), player(8, 1300));
        return runEloScenario("normal_upset_loss",
                "No group/tier info, team1 heavily favored (avg 1700 vs 1300) but loses - "
                        + "demonstrates a large uncushioned negative delta.",
                players, "5:6", "7:8", 18, 21, null, null, null);
    }

    private Map<String, Object> scenarioTierWinBoost() {
        Map<Integer, Player> players = playersById(
                player(11, 1000), player(12, 1000), player(13, 1050), player(14, 1050));
        // Extra same-day match just to establish a day-wide score gap >= 200 without
        // perturbing this encounter's own team averages / win expectancy.
        Encounter other = Encounter.builder()
                .id(2001).team1("15:16").team2("17:18").encounterDate(DAY)
                .team1SetPoints(21).team2SetPoints(10).groupIndex(1).totalGroups(2).build();
        players.put(15, player(15, 1300));
        players.put(16, player(16, 1300));
        players.put(17, player(17, 1000));
        players.put(18, player(18, 1000));
        return runEloScenario("tier_win_boost",
                "Lower tier group (groupIndex=2 of 2), team1 is the slight favorite and wins as "
                        + "expected - WIN_BOOST amplifies the positive base Elo delta. Day-wide gap "
                        + "established via a second same-day match (players 15-18).",
                players, "11:12", "13:14", 21, 15, 2, 2, List.of(other));
    }

    private Map<String, Object> scenarioTierLossConsolationCapped() {
        Map<Integer, Player> players = playersById(
                player(41, 2000), player(42, 2000), player(43, 1000), player(44, 1000));
        return runEloScenario("tier_loss_consolation_capped",
                "Lower tier group (groupIndex=2 of 2). team1 is a huge favorite (avg 2000 vs 1000) "
                        + "but loses a close set (18-21) - the shielded loss magnitude comfortably "
                        + "exceeds CONSOLATION_CAP=2, so consolation is capped rather than "
                        + "proportional to the shielded loss.",
                players, "41:42", "43:44", 18, 21, 2, 2, null);
    }

    private Map<String, Object> scenarioTierLossConsolationNotCapped() {
        Map<Integer, Player> players = playersById(
                player(31, 1000), player(32, 1000), player(33, 1614), player(34, 1614));
        return runEloScenario("tier_loss_consolation_not_capped",
                "Lower tier group (groupIndex=2 of 2). team1 is a huge underdog (avg 1000 vs 1614, "
                        + "expected win prob ~0.05) and loses a blowout (3-21) as expected - the "
                        + "shielded loss magnitude is small (< CONSOLATION_CAP=2) so consolation is "
                        + "proportional, and the low set points (3/20) further suppress it via the ratio.",
                players, "31:32", "33:34", 3, 21, 2, 2, null);
    }

    private Map<String, Object> scenarioTierNotTriggeredGapBelow200() {
        Map<Integer, Player> players = playersById(
                player(21, 1000), player(22, 1000), player(23, 1080), player(24, 1080));
        return runEloScenario("tier_not_triggered_gap_below_200",
                "groupIndex/totalGroups present (2 of 3, would normally imply a tier factor) but "
                        + "the day-wide score gap (80) is below TIER_BOOST_MIN_SCORE_GAP=200, so no "
                        + "tier adjustment or consolation is applied despite team1 winning.",
                players, "21:22", "23:24", 21, 15, 2, 3, null);
    }

    private Map<String, Object> scenarioTierNotTriggeredSingleGroup() {
        Map<Integer, Player> players = playersById(
                player(25, 1000), player(26, 1000), player(27, 1400), player(28, 1400));
        return runEloScenario("tier_not_triggered_single_group",
                "totalGroups=1 (no tiering that day) with a large score gap (400) - proves "
                        + "totalGroups<=1 short-circuits the tier factor regardless of score gap.",
                players, "25:26", "27:28", 21, 10, 1, 1, null);
    }

    private Map<String, Object> runEloScenario(String name, String description,
            Map<Integer, Player> players, String team1Ids, String team2Ids,
            int team1SetPoints, int team2SetPoints,
            Integer groupIndex, Integer totalGroups,
            List<Encounter> otherEncountersSameDay) {

        PlayerRepository playerRepository = mockPlayerRepository(players);
        PlayerUtil playerUtil = playerUtilFor(playerRepository);
        EncounterRepository encounterRepository = mock(EncounterRepository.class);
        ScorePersister scorePersister = mock(ScorePersister.class);
        CommonAbsenteeManager absenteeManager = mock(CommonAbsenteeManager.class);

        Encounter encounter = Encounter.builder()
                .id(1000)
                .team1(team1Ids)
                .team2(team2Ids)
                .encounterDate(DAY)
                .team1SetPoints(team1SetPoints)
                .team2SetPoints(team2SetPoints)
                .groupIndex(groupIndex)
                .totalGroups(totalGroups)
                .build();

        List<Encounter> dayEncounters = new ArrayList<>();
        if (otherEncountersSameDay != null) {
            dayEncounters.addAll(otherEncountersSameDay);
        }
        dayEncounters.add(encounter);
        when(encounterRepository.findAllByEncounterDate(DAY)).thenReturn(dayEncounters);

        EloRankScoreCalculator calculator = new EloRankScoreCalculator(
                playerUtil, scorePersister, absenteeManager, playerRepository, encounterRepository, objectMapper);

        calculator.calculateAndPersist(encounter);

        ArgumentCaptor<Double> t1Captor = ArgumentCaptor.forClass(Double.class);
        ArgumentCaptor<Double> t2Captor = ArgumentCaptor.forClass(Double.class);
        ArgumentCaptor<String> breakdownCaptor = ArgumentCaptor.forClass(String.class);
        verify(scorePersister).persistScores(eq(1000), t1Captor.capture(), t2Captor.capture(), breakdownCaptor.capture());

        Map<String, Object> input = new LinkedHashMap<>();
        input.put("team1PlayerRankScores", teamScores(players, team1Ids));
        input.put("team2PlayerRankScores", teamScores(players, team2Ids));
        input.put("team1SetPoints", team1SetPoints);
        input.put("team2SetPoints", team2SetPoints);
        input.put("groupIndex", groupIndex);
        input.put("totalGroups", totalGroups);
        input.put("dayWideScoreGapLargeEnough", isScoreGapLargeEnoughAmong(dayEncounters, players));

        Map<String, Object> output = new LinkedHashMap<>();
        output.put("team1Score", t1Captor.getValue());
        output.put("team2Score", t2Captor.getValue());
        try {
            JsonNode breakdown = objectMapper.readTree(breakdownCaptor.getValue());
            output.put("scoreBreakdown", breakdown);
        } catch (IOException e) {
            throw new RuntimeException(e);
        }

        Map<String, Object> scenario = new LinkedHashMap<>();
        scenario.put("name", name);
        scenario.put("description", description);
        scenario.put("input", input);
        scenario.put("output", output);
        return scenario;
    }

    // ---------------------------------------------------------------- Absentee scenarios

    private Map<String, Object> runAbsenteeScenario(String name, String description,
            int priorAbsencesInLast5, Player player) {
        ScorePersister scorePersister = mock(ScorePersister.class);
        EncounterRepository encounterRepository = mock(EncounterRepository.class);
        ScoreHistoryRepository scoreHistoryRepository = mock(ScoreHistoryRepository.class);

        List<ScoreHistory> history = buildAbsenceHistory(player.getId(), priorAbsencesInLast5);
        when(scoreHistoryRepository.findAllByPlayerIdOrderByEncounterDateDescIdDesc(player.getId()))
                .thenReturn(history);

        CommonAbsenteeManager manager = new CommonAbsenteeManager(scorePersister, encounterRepository, scoreHistoryRepository);
        manager.calculateAbsenteeScoreAndPersist(List.of(player));

        Map<String, Object> output = new LinkedHashMap<>();
        if (priorAbsencesInLast5 >= 5) {
            ArgumentCaptor<Integer> encIdCaptor = ArgumentCaptor.forClass(Integer.class);
            verify(scorePersister).deactivatePlayer(eq(player), encIdCaptor.capture(), any());
            verify(scorePersister, never()).updatePlayer(anyDouble(), anyInt(), any(), any());
            output.put("action", "deactivated");
            output.put("encounterIdUsed", encIdCaptor.getValue());
        } else {
            ArgumentCaptor<Double> pointsCaptor = ArgumentCaptor.forClass(Double.class);
            ArgumentCaptor<Integer> encIdCaptor = ArgumentCaptor.forClass(Integer.class);
            verify(scorePersister).updatePlayer(pointsCaptor.capture(), encIdCaptor.capture(), any(), eq(player));
            verify(scorePersister, never()).deactivatePlayer(any(), anyInt(), any());
            output.put("action", "demeritApplied");
            output.put("pointsApplied", pointsCaptor.getValue());
            output.put("encounterIdUsed", encIdCaptor.getValue());
        }

        Map<String, Object> input = new LinkedHashMap<>();
        input.put("priorAbsencesWithinLast5Games", priorAbsencesInLast5);

        Map<String, Object> scenario = new LinkedHashMap<>();
        scenario.put("name", name);
        scenario.put("description", description);
        scenario.put("input", input);
        scenario.put("output", output);
        return scenario;
    }

    private List<ScoreHistory> buildAbsenceHistory(int playerId, int absentCountInTop5) {
        List<ScoreHistory> list = new ArrayList<>();
        for (int i = 0; i < 5; i++) {
            ScoreHistory.ScoreHistoryBuilder b = ScoreHistory.builder()
                    .id(100 - i)
                    .playerId(playerId)
                    .encounterDate(LocalDate.of(2026, 9, 1).minusDays(i * 2L))
                    .oldRankScore(1000.0)
                    .newRankScore(1000.0);
            b.encounterId(i < absentCountInTop5 ? ABSENTEE_ENCOUNTER_ID : 500 + i);
            list.add(b.build());
        }
        return list;
    }

    // ---------------------------------------------------------------- Activation scenarios

    private Map<String, Object> runActivateExplicitScoreScenario() {
        Player player = player(71, 900);
        player.setStatus(PlayerStatus.DISABLED);

        PlayerRepository playerRepository = mock(PlayerRepository.class);
        when(playerRepository.findById(71)).thenReturn(Optional.of(player));
        ScoreHistoryRepository scoreHistoryRepository = mock(ScoreHistoryRepository.class);

        ScorePersister persister = new ScorePersister();
        ReflectionTestUtils.setField(persister, "playerRepository", playerRepository);
        ReflectionTestUtils.setField(persister, "scoreHistoryRepository", scoreHistoryRepository);

        persister.activatePlayer(player, 1234.5);

        ArgumentCaptor<ScoreHistory> historyCaptor = ArgumentCaptor.forClass(ScoreHistory.class);
        verify(scoreHistoryRepository).save(historyCaptor.capture());

        Map<String, Object> input = new LinkedHashMap<>();
        input.put("rankScoreBeforeActivation", 900.0);
        input.put("explicitActivateScore", 1234.5);
        input.put("currentSameRankPlayerScore", null);
        input.put("currentMinActiveRankScore", null);

        return activationResult("activate_with_explicit_score",
                "Explicit activateScore provided - takes precedence over any auto-calculation.",
                input, player, historyCaptor.getValue());
    }

    private Map<String, Object> runActivateAutoWithRankMatchScenario() {
        Player player = player(81, 800);
        player.setStatus(PlayerStatus.DISABLED);

        PlayerRepository playerRepository = mock(PlayerRepository.class);
        when(playerRepository.findById(81)).thenReturn(Optional.of(player));
        ScoreHistoryRepository scoreHistoryRepository = mock(ScoreHistoryRepository.class);

        ScoreHistory lastActiveGame = ScoreHistory.builder()
                .id(1).playerId(81).encounterId(999)
                .encounterDate(LocalDate.of(2026, 1, 10))
                .playerNewRank(3).oldRankScore(800.0).newRankScore(800.0).build();
        when(scoreHistoryRepository.findAllByPlayerId(81)).thenReturn(List.of(lastActiveGame));

        Player rank3Player = player(82, 1400);
        rank3Player.setPlayerRank(3);
        rank3Player.setStatus(PlayerStatus.ACTIVE);
        Player otherActive = player(83, 1100);
        otherActive.setPlayerRank(5);
        otherActive.setStatus(PlayerStatus.ACTIVE);
        when(playerRepository.findAll()).thenReturn(List.of(rank3Player, otherActive, player));

        ScorePersister persister = new ScorePersister();
        ReflectionTestUtils.setField(persister, "playerRepository", playerRepository);
        ReflectionTestUtils.setField(persister, "scoreHistoryRepository", scoreHistoryRepository);

        persister.activatePlayer(player, null);

        ArgumentCaptor<ScoreHistory> historyCaptor = ArgumentCaptor.forClass(ScoreHistory.class);
        verify(scoreHistoryRepository).save(historyCaptor.capture());

        Map<String, Object> input = new LinkedHashMap<>();
        input.put("rankScoreBeforeActivation", 800.0);
        input.put("explicitActivateScore", null);
        input.put("lastActiveGamePlayerNewRank", 3);
        input.put("currentSameRankPlayerScore", 1400.0);
        input.put("currentMinActiveRankScore", 1100.0);
        input.put("note", "A currently-active player (id=82) occupies playerRank=3 -> "
                + "newScore = that player's rankScore - (DEMERIT_POINTS_ABSENTEE * 3)");

        return activationResult("activate_auto_score_with_rank_match",
                "No explicit score; auto-calculated from the last active game's playerNewRank, "
                        + "which matches a currently-active player's playerRank.",
                input, player, historyCaptor.getValue());
    }

    private Map<String, Object> runActivateAutoFallbackToMinScenario() {
        Player player = player(91, 700);
        player.setStatus(PlayerStatus.DISABLED);

        PlayerRepository playerRepository = mock(PlayerRepository.class);
        when(playerRepository.findById(91)).thenReturn(Optional.of(player));
        ScoreHistoryRepository scoreHistoryRepository = mock(ScoreHistoryRepository.class);

        ScoreHistory lastActiveGame = ScoreHistory.builder()
                .id(2).playerId(91).encounterId(998)
                .encounterDate(LocalDate.of(2026, 1, 5))
                .playerNewRank(99).oldRankScore(700.0).newRankScore(700.0).build();
        when(scoreHistoryRepository.findAllByPlayerId(91)).thenReturn(List.of(lastActiveGame));

        Player active1 = player(92, 950);
        active1.setPlayerRank(6);
        active1.setStatus(PlayerStatus.ACTIVE);
        Player active2 = player(93, 1200);
        active2.setPlayerRank(2);
        active2.setStatus(PlayerStatus.ACTIVE);
        when(playerRepository.findAll()).thenReturn(List.of(active1, active2, player));

        ScorePersister persister = new ScorePersister();
        ReflectionTestUtils.setField(persister, "playerRepository", playerRepository);
        ReflectionTestUtils.setField(persister, "scoreHistoryRepository", scoreHistoryRepository);

        persister.activatePlayer(player, null);

        ArgumentCaptor<ScoreHistory> historyCaptor = ArgumentCaptor.forClass(ScoreHistory.class);
        verify(scoreHistoryRepository).save(historyCaptor.capture());

        Map<String, Object> input = new LinkedHashMap<>();
        input.put("rankScoreBeforeActivation", 700.0);
        input.put("explicitActivateScore", null);
        input.put("lastActiveGamePlayerNewRank", 99);
        input.put("currentSameRankPlayerScore", null);
        input.put("currentMinActiveRankScore", 950.0);
        input.put("note", "No currently-active player occupies playerRank=99 -> falls back to "
                + "min rankScore among active players (950) - (DEMERIT_POINTS_ABSENTEE * 3)");

        return activationResult("activate_auto_score_fallback_to_min",
                "No explicit score; auto-calculation's rank-match lookup finds no active player "
                        + "at the last game's playerNewRank, so it falls back to the current minimum "
                        + "active rankScore.",
                input, player, historyCaptor.getValue());
    }

    private Map<String, Object> activationResult(String name, String description,
            Map<String, Object> input, Player playerAfter, ScoreHistory historySaved) {
        Map<String, Object> output = new LinkedHashMap<>();
        output.put("statusAfter", playerAfter.getStatus());
        output.put("rankScoreAfter", playerAfter.getRankScore());
        output.put("scoreHistory.oldRankScore", historySaved.getOldRankScore());
        output.put("scoreHistory.newRankScore", historySaved.getNewRankScore());
        output.put("scoreHistory.encounterId", historySaved.getEncounterId());

        Map<String, Object> scenario = new LinkedHashMap<>();
        scenario.put("name", name);
        scenario.put("description", description);
        scenario.put("input", input);
        scenario.put("output", output);
        return scenario;
    }

    // ---------------------------------------------------------------- shared helpers

    private Player player(int id, double rankScore) {
        Player p = new Player();
        p.setId(id);
        p.setName("Player" + id);
        p.setRankScore(rankScore);
        p.setPlayerRank(id);
        p.setStatus(PlayerStatus.ACTIVE);
        return p;
    }

    private Map<Integer, Player> playersById(Player... players) {
        Map<Integer, Player> map = new LinkedHashMap<>();
        for (Player p : players) {
            map.put(p.getId(), p);
        }
        return map;
    }

    private PlayerRepository mockPlayerRepository(Map<Integer, Player> byId) {
        PlayerRepository repo = mock(PlayerRepository.class);
        when(repo.findById(anyInt())).thenAnswer(inv -> Optional.ofNullable(byId.get((Integer) inv.getArgument(0))));
        return repo;
    }

    private PlayerUtil playerUtilFor(PlayerRepository repo) {
        PlayerUtil util = new PlayerUtil();
        ReflectionTestUtils.setField(util, "playerRepository", repo);
        return util;
    }

    private List<Double> teamScores(Map<Integer, Player> players, String idsString) {
        List<Double> scores = new ArrayList<>();
        for (String idStr : idsString.split(":")) {
            scores.add(players.get(Integer.parseInt(idStr)).getRankScore());
        }
        return scores;
    }

    // Mirrors EloRankScoreCalculator.isScoreGapLargeEnough exactly (distinct participants across
    // the day's encounters, max-min rankScore >= TIER_BOOST_MIN_SCORE_GAP), computed directly
    // from the scenario's own fixtures rather than hand-derived, so the fixture's
    // `dayWideScoreGapLargeEnough` input can't drift from what the mocked repositories actually
    // represent.
    private boolean isScoreGapLargeEnoughAmong(List<Encounter> dayEncounters, Map<Integer, Player> players) {
        var stats = dayEncounters.stream()
                .flatMap(e -> java.util.stream.Stream.of(e.getTeam1(), e.getTeam2()))
                .distinct()
                .flatMap(ids -> teamScores(players, ids).stream())
                .mapToDouble(Double::doubleValue)
                .summaryStatistics();
        return stats.getCount() >= 2 && (stats.getMax() - stats.getMin()) >= 200;
    }
}
