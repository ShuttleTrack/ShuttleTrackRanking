import * as Sentry from '@sentry/nextjs';

declare global {
  // eslint-disable-next-line no-var
  var __telegramCronRegistered: boolean | undefined;
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
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
