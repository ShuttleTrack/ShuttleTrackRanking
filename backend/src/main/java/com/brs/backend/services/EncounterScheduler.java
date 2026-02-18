package com.brs.backend.services;

import com.brs.backend.configuration.TelegramGroupConfig;
import com.pengrad.telegrambot.TelegramBot;
import com.pengrad.telegrambot.request.SendPoll;
import com.pengrad.telegrambot.response.SendResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;

@Service
@Slf4j
public class EncounterScheduler {

    private final TelegramGroupConfig telegramGroupConfig;

    public EncounterScheduler(TelegramGroupConfig telegramGroupConfig) {
        this.telegramGroupConfig = telegramGroupConfig;
    }

    @Scheduled(cron = "0 0 17 * * *")
    public void scheduleEncounter() {
        log.info("scheduleEncounter running at {}", LocalDate.now());
        log.info("configuration groups: {}", telegramGroupConfig.getGroups());
        DayOfWeek today = LocalDate.now().getDayOfWeek();

        // Check if there's a group configuration for today
        TelegramGroupConfig.GroupConfig groupConfig = telegramGroupConfig.getGroups().get(today);

        if (groupConfig != null) {
            sendEncounterPoll(today, groupConfig);
        } else {
            log.debug("No group configured for {}", today);
        }
    }

    private void sendEncounterPoll(DayOfWeek day, TelegramGroupConfig.GroupConfig groupConfig) {
        try {
            LocalDate matchDate = LocalDate.now().with(TemporalAdjusters.next(groupConfig.getMatchDay()));
            TelegramBot bot = new TelegramBot(groupConfig.getBotKey());

            SendPoll poll = new SendPoll(groupConfig.getGroupId(),
                "Joining Badminton on " + matchDate, "In", "In (from overflow)", "Out", "Out (slot passed to someone else)");
            poll.allowsMultipleAnswers(false);
            poll.isAnonymous(false);

            SendResponse pollResponse = bot.execute(poll);

            if (pollResponse.isOk()) {
                log.info("Successfully sent poll on {} to group {} for match on {}",
                    day, groupConfig.getGroupId(), matchDate);
            } else {
                log.error("Failed to send poll on {} to group {}. Error: {}",
                    day, groupConfig.getGroupId(), pollResponse.description());
            }
        } catch (Exception e) {
            log.error("Error sending encounter poll on {} to group {}",
                day, groupConfig.getGroupId(), e);
        }
    }

}
