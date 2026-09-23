import * as Sentry from '@sentry/nextjs';

declare global {
  // eslint-disable-next-line no-var
  var __telegramCronRegistered: boolean | undefined;
  // eslint-disable-next-line no-var
  var __gameDayCronRegistered: boolean | undefined;
}

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');

    // Ported backend EncounterScheduler's `@Scheduled(cron = "0 0 17 * * *")`
    // (MIGRATION_PLAN.md Phase 6). node-cron needs real Node.js built-ins
    // (crypto/path/child_process), so this must stay inside this `NEXT_RUNTIME === 'nodejs'`
    // branch specifically - an inverted early-return guard was tried first and broke the
    // production build, because this repo's src/middleware.ts forces Next.js to also compile
    // instrumentation.ts for the edge runtime, and only this exact `===` form is what Next's
    // build-time substitution + dead-code elimination recognizes to drop the branch (and its
    // dynamic import) from that edge bundle.
    if (!global.__telegramCronRegistered) {
      global.__telegramCronRegistered = true;

      const cron = await import('node-cron');
      const { runDailyEncounterPollCheck } = await import('./lib/telegram/scheduler');

      // Timezone pinned explicitly (Europe/Amsterdam - the only clear timezone reference in
      // this repo, from the frontend publish workflow's build-identifier timestamp) rather
      // than trusting the container's default TZ.
      cron.schedule('0 0 17 * * *', () => {
        runDailyEncounterPollCheck().catch((error) => {
          console.error('[telegram-scheduler] Unhandled error in scheduled run', error);
        });
      }, { timezone: 'Europe/Amsterdam' });

      console.log('[telegram-scheduler] Registered daily encounter poll cron (17:00 Europe/Amsterdam)');
    }

    // Game-day check-in scheduler (ATTENDANCE_VOTE_PLAN.md) - every 5 minutes rather than at a
    // fixed time, because its thresholds (09:00 / 10:00 / 13:00) are wall-clock times in each
    // squad's own zone, which no single cron time can hit across squads or across DST. Runs
    // beside the 17:00 poll above, which it deliberately does not replace yet (the plan's
    // Decision 2). Same placement rule: inside this NEXT_RUNTIME === 'nodejs' block, never
    // beside it, with its own registered flag.
    if (!global.__gameDayCronRegistered) {
      global.__gameDayCronRegistered = true;

      const cron = await import('node-cron');
      const { runGameDayTick } = await import('./lib/gameDay/scheduler');

      cron.schedule('*/5 * * * *', () => {
        runGameDayTick()
          .then((summary) => {
            if (summary.created || summary.recreated || summary.cancelled || summary.closed || summary.errors) {
              console.log('[game-day] Tick', summary);
            }
          })
          .catch((error) => {
            console.error('[game-day] Unhandled error in scheduled tick', error);
          });
      });

      console.log('[game-day] Registered game-day check-in scheduler (every 5 minutes)');
    }
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
