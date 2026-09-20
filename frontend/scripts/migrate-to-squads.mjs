#!/usr/bin/env node
// Staged multi-squad migration (SQUAD_TENANCY_PLAN.md). Turns today's single-squad data into
// one Squad, without ever running an unattended blind schema change against production.
//
// Why staged, not one script: `prisma db push` can't add a NOT NULL column and backfill it in
// the same shot against a populated table, and the Player.email audit is a data-quality
// checkpoint that can block on a real human decision - it isn't scriptable.
//
// Usage (run from frontend/):
//   node scripts/migrate-to-squads.mjs stage1 --name "Dutch Lankan Shuttle Masters" --slug main
//   node scripts/migrate-to-squads.mjs stage2
//   node scripts/migrate-to-squads.mjs stage3   (prints the command to run - see below)
//
// Stage 0 (rehearsal) isn't a script - it's running stage1/stage2/stage3 against a disposable
// copy of the real data first (e.g. the local `brs-local-mysql` dev container) before ever
// pointing DATABASE_URL at production.
//
// Stage 1 - Expand: additive only, safe while the current single-squad app code keeps running
//   (it doesn't know these columns/tables exist yet). Creates Squad/SquadAdmin, adds squad_id/
//   squadId as NULLABLE to PLAYER/ENCOUNTER/Game, creates one Squad row, backfills every
//   existing row to it, and converts ALLOWED_ADMIN_EMAILS into SquadAdmin rows for it.
//
// Stage 2 - Data-quality gate: reports players with a missing or duplicate email. Exits non-zero
//   if anything needs a human decision before Stage 3 can safely add the NOT NULL / unique
//   constraints - fix the flagged rows (via the admin UI or directly), then re-run stage2 until
//   it's clean.
//
// Stage 3 - Contract: NOT a raw-SQL step here on purpose. Once Stage 2 is clean, `prisma db
//   push` (run against frontend/prisma/schema.prisma, which already declares the final,
//   required/unique shape) diffs the now-compliant database and applies exactly the remaining
//   NOT NULL / unique / foreign-key changes itself - more reliable than hand-writing ALTER TABLE
//   and guessing Prisma's own constraint-naming convention. This command just prints the
//   reminder rather than shelling out, so it's a deliberate, visible step, not a silent one.

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function arg(name, fallback) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

async function stage1() {
  const name = arg('name');
  const slug = arg('slug');
  if (!name || !slug) {
    console.error('stage1 requires --name "<squad name>" --slug <squad-slug>');
    process.exitCode = 1;
    return;
  }

  console.log(`Stage 1 (expand): creating Squad "${name}" (slug "${slug}") and backfilling existing data.`);

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS Squad (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(191) NOT NULL,
        slug VARCHAR(191) NOT NULL,
        enabled TINYINT(1) NOT NULL DEFAULT 1,
        createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt DATETIME(3) NOT NULL,
        UNIQUE KEY Squad_slug_key (slug)
      ) CHARACTER SET utf8mb4
    `);

    await tx.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS SquadAdmin (
        id INT AUTO_INCREMENT PRIMARY KEY,
        squadId INT NOT NULL,
        email VARCHAR(191) NOT NULL,
        UNIQUE KEY SquadAdmin_squadId_email_key (squadId, email),
        CONSTRAINT SquadAdmin_squadId_fkey FOREIGN KEY (squadId) REFERENCES Squad(id)
      ) CHARACTER SET utf8mb4
    `);

    // Additive, nullable for now - Stage 3 (prisma db push) tightens these once Stage 2 is clean.
    await addColumnIfMissing(tx, 'PLAYER', 'squad_id', 'INT NULL');
    await addColumnIfMissing(tx, 'ENCOUNTER', 'squad_id', 'INT NULL');
    await addColumnIfMissing(tx, 'Game', 'squadId', 'INT NULL');

    const existing = await tx.$queryRawUnsafe(`SELECT id FROM Squad WHERE slug = ?`, slug);
    let squadId;
    if (existing.length > 0) {
      squadId = existing[0].id;
      console.log(`Squad "${slug}" already exists (id ${squadId}) - reusing it (safe to re-run this stage).`);
    } else {
      await tx.$executeRawUnsafe(
        `INSERT INTO Squad (name, slug, enabled, updatedAt) VALUES (?, ?, 1, NOW(3))`,
        name,
        slug
      );
      const row = await tx.$queryRawUnsafe(`SELECT id FROM Squad WHERE slug = ?`, slug);
      squadId = row[0].id;
      console.log(`Created Squad id ${squadId}.`);
    }

    const playerCount = await tx.$executeRawUnsafe(
      `UPDATE PLAYER SET squad_id = ? WHERE squad_id IS NULL`,
      squadId
    );
    const encounterCount = await tx.$executeRawUnsafe(
      `UPDATE ENCOUNTER SET squad_id = ? WHERE squad_id IS NULL`,
      squadId
    );
    const gameCount = await tx.$executeRawUnsafe(
      `UPDATE Game SET squadId = ? WHERE squadId IS NULL`,
      squadId
    );
    console.log(`Backfilled squadId on ${playerCount} player(s), ${encounterCount} encounter(s), ${gameCount} game(s).`);

    const adminEmails = (process.env.ALLOWED_ADMIN_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    for (const email of adminEmails) {
      await tx.$executeRawUnsafe(
        `INSERT IGNORE INTO SquadAdmin (squadId, email) VALUES (?, ?)`,
        squadId,
        email
      );
    }
    console.log(
      adminEmails.length > 0
        ? `Seeded ${adminEmails.length} SquadAdmin row(s) from ALLOWED_ADMIN_EMAILS.`
        : 'ALLOWED_ADMIN_EMAILS is empty - no SquadAdmin rows seeded (expected in this environment).'
    );
  });

  console.log('Stage 1 complete. Run `node scripts/migrate-to-squads.mjs stage2` next.');
}

async function addColumnIfMissing(tx, table, column, definition) {
  const rows = await tx.$queryRawUnsafe(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table,
    column
  );
  if (Number(rows[0].c) > 0) {
    console.log(`${table}.${column} already exists - skipping (safe to re-run this stage).`);
    return;
  }
  await tx.$executeRawUnsafe(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

async function stage2() {
  console.log('Stage 2 (data-quality gate): auditing PLAYER.email before Stage 3 tightens it to NOT NULL + unique per squad.');

  const missing = await prisma.$queryRawUnsafe(
    `SELECT id, name, squad_id FROM PLAYER WHERE email IS NULL OR email = ''`
  );
  const duplicates = await prisma.$queryRawUnsafe(`
    SELECT squad_id, LOWER(email) AS email, COUNT(*) AS c, GROUP_CONCAT(id) AS player_ids
    FROM PLAYER
    WHERE email IS NOT NULL AND email != ''
    GROUP BY squad_id, LOWER(email)
    HAVING c > 1
  `);

  if (missing.length === 0 && duplicates.length === 0) {
    console.log('Clean: every player has a non-empty, unique-per-squad email. Safe to run Stage 3.');
    return;
  }

  if (missing.length > 0) {
    console.log(`\n${missing.length} player(s) with no email - each needs one added before Stage 3:`);
    for (const p of missing) console.log(`  - id ${p.id} "${p.name}" (squad ${p.squad_id})`);
  }
  if (duplicates.length > 0) {
    console.log(`\n${duplicates.length} duplicate email group(s) within a squad - resolve before Stage 3:`);
    for (const d of duplicates) console.log(`  - "${d.email}" (squad ${d.squad_id}): player ids ${d.player_ids}`);
  }
  console.log('\nRe-run this stage after fixing the rows above.');
  process.exitCode = 1;
}

function stage3() {
  console.log([
    'Stage 3 (contract) is not a raw-SQL step in this script on purpose - once Stage 2 reports',
    'clean, run:',
    '',
    '  npx prisma db push',
    '',
    'against frontend/prisma/schema.prisma. It diffs the now-compliant database against the',
    'final schema (squadId/email required, unique constraints, foreign keys) and applies exactly',
    'those changes - more reliable than this script guessing Prisma\'s constraint-naming scheme.',
    'Follow with Stage 4 (deploy the squad-aware application code).',
  ].join('\n'));
}

const stage = process.argv[2];
try {
  if (stage === 'stage1') await stage1();
  else if (stage === 'stage2') await stage2();
  else if (stage === 'stage3') stage3();
  else {
    console.error('Usage: node scripts/migrate-to-squads.mjs <stage1|stage2|stage3> [--name "..."] [--slug ...]');
    process.exitCode = 1;
  }
} finally {
  await prisma.$disconnect();
}
