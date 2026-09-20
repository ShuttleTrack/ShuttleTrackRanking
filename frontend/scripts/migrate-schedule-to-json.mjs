#!/usr/bin/env node
// One-off: collapses Squad's separate recurrence-schedule columns (is_recurring,
// schedule_day_of_week, schedule_start_time, schedule_end_time, schedule_start_date,
// schedule_end_date, schedule_skip_dates) into a single `schedule` JSON column - see the comment
// on Squad.schedule in schema.prisma for why (nothing ever queried/filtered by any of them
// individually, so separate columns bought nothing but column count).
//
// Run BEFORE pulling/applying the schema.prisma change that removes the old columns:
//   node scripts/migrate-schedule-to-json.mjs
// It adds the `schedule` column if missing and packs every existing row's old columns into it
// (safe to re-run - it always re-derives `schedule` from the still-present old columns, which
// this script never touches). Once every environment has run this, apply the schema.prisma
// change and run `npx prisma db push --accept-data-loss` (the "data loss" is exactly the old
// columns this script already copied out of).

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function toDateOnlyString(value) {
  if (!value) return null;
  return new Date(value).toISOString().slice(0, 10);
}

async function main() {
  try {
    await prisma.$executeRawUnsafe('ALTER TABLE Squad ADD COLUMN schedule JSON NULL');
    console.log('Added Squad.schedule column.');
  } catch (error) {
    if (error?.meta?.code === '1060') {
      console.log('Squad.schedule already exists - skipping.');
    } else {
      throw error;
    }
  }

  const squads = await prisma.$queryRawUnsafe(`
    SELECT id, is_recurring, schedule_day_of_week, schedule_start_time, schedule_end_time,
           schedule_start_date, schedule_end_date, schedule_skip_dates
    FROM Squad
  `);

  for (const s of squads) {
    const schedule = {
      isRecurring: Boolean(s.is_recurring),
      dayOfWeek: s.schedule_day_of_week ?? null,
      startTime: s.schedule_start_time ?? null,
      endTime: s.schedule_end_time ?? null,
      startDate: toDateOnlyString(s.schedule_start_date),
      endDate: toDateOnlyString(s.schedule_end_date),
      skipDates: Array.isArray(s.schedule_skip_dates) ? s.schedule_skip_dates : [],
    };
    await prisma.$executeRawUnsafe(
      'UPDATE Squad SET schedule = ? WHERE id = ?',
      JSON.stringify(schedule),
      s.id
    );
    console.log(`Squad ${s.id}: ${JSON.stringify(schedule)}`);
  }

  console.log(
    `\nPacked ${squads.length} squad(s). Now pull the schema.prisma change that drops the old ` +
    'columns and run `npx prisma db push --accept-data-loss`.'
  );
}

main().finally(() => prisma.$disconnect());
