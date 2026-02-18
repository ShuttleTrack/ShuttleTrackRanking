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
        DayOfWeek today = LocalDate.now().getDayOfWeek();

        // Find the group configuration for today
        telegramGroupConfig.getGroups().stream()
            .filter(group -> group.getDay() == today)
            .forEach(this::sendEncounterPoll);
    }

    private void sendEncounterPoll(TelegramGroupConfig.GroupConfig groupConfig) {
        try {
            LocalDate matchDate = LocalDate.now().with(TemporalAdjusters.next(groupConfig.getMatchDay()));
            TelegramBot bot = new TelegramBot(groupConfig.getBotKey());

            SendPoll poll = new SendPoll(groupConfig.getGroupId(),
                "Joining Badminton on " + matchDate, "In", "In (from overflow)", "Out", "Out (slot passed to someone else)");
            poll.allowsMultipleAnswers(false);
            poll.isAnonymous(false);

            SendResponse pollResponse = bot.execute(poll);

            if (pollResponse.isOk()) {
                log.info("Successfully sent poll to group {} for match on {}",
                    groupConfig.getGroupId(), matchDate);
            } else {
                log.error("Failed to send poll to group {}. Error: {}",
                    groupConfig.getGroupId(), pollResponse.description());
            }
        } catch (Exception e) {
            log.error("Error sending encounter poll to group {}",
                groupConfig.getGroupId(), e);
        }
    }

}
