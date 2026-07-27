package com.brs.backend.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;

/**
 * CREATE TABLE `ENCOUNTER` (
 *   `id` int NOT NULL AUTO_INCREMENT,
 *   `team_1` varchar(32) NOT NULL,
 *   `team_2` varchar(32) NOT NULL,
 *   `encounter_date` date NOT NULL,
 *   `processed` tinyint(1) NOT NULL DEFAULT '0',
 *   `team_1_set_points` int NOT NULL,
 *   `team_2_set_points` int NOT NULL,
 *   `calculated_score` double DEFAULT NULL,
 *   `group_index` int DEFAULT NULL,
 *   `total_groups` int DEFAULT NULL,
 *   PRIMARY KEY (`id`),
 *   UNIQUE KEY `team_uniqness` (`team_1`,`team_2`,`encounter_date`)
 * ) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
 */
@Entity(name = "ENCOUNTER")
@Table(name = "ENCOUNTER")
@Getter
@Setter
@ToString
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Encounter {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;
    @Column(name = "team_1")
    private String team1;
    @Column(name = "team_2")
    private String team2;
    @Column(name = "encounter_date")
    private LocalDate encounterDate;
    private boolean processed;
    @Column(name = "team_1_set_points")
    private int team1SetPoints;
    @Column(name = "team_2_set_points")
    private int team2SetPoints;
    @Column(name = "calculated_score")
    private Double calculatedScore;
    @Column(name = "group_index")
    private Integer groupIndex;
    @Column(name = "total_groups")
    private Integer totalGroups;
}
