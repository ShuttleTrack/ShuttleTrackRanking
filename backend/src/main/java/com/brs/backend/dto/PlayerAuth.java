package com.brs.backend.dto;

import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import lombok.Data;

@Data
@JsonSerialize
public class PlayerAuth {
    private PlayerInfo player;
    private AccessLevel[] accessLevel;
}
