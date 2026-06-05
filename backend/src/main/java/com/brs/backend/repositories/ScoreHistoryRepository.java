package com.brs.backend.repositories;

import com.brs.backend.model.ScoreHistory;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface ScoreHistoryRepository extends JpaRepository<ScoreHistory, Integer> {

    List<ScoreHistory> findAllByPlayerId(Integer id);

    // Ordered newest-first so callers that take a recent window (e.g. the absentee
    // streak in CommonAbsenteeManager) genuinely get the most recent rows. Plain
    // findAllByPlayerId has no defined order, so a positional limit on it is unreliable.
    List<ScoreHistory> findAllByPlayerIdOrderByEncounterDateDescIdDesc(Integer playerId);

    List<ScoreHistory> findAllByPlayerIdAndEncounterDate(Integer playerId, LocalDate encounterDate);

    Optional<ScoreHistory> findFirstByPlayerIdOrderByEncounterDateDesc(Integer playerId);
}
