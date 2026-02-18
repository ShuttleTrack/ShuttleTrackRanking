package com.brs.backend.configuration;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.time.DayOfWeek;
import java.util.List;

@Component
@ConfigurationProperties(prefix = "api.tg")
@Data
public class TelegramGroupConfig {
    private List<GroupConfig> groups;

    @Data
    public static class GroupConfig {
        private DayOfWeek day;
        private DayOfWeek matchDay;
        private String botKey;
        private String groupId;
    }
}

