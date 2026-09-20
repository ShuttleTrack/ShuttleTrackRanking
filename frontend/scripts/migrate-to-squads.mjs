#!/usr/bin/env node
// Staged multi-squad migration (SQUAD_TENANCY_PLAN.md). Turns today's single-squad data into
// one Squad, without ever running an unattended blind schema change against production.
//
// Why staged, not one script: `prisma db push` can't add a NOT NULL column and backfill it in
// the same shot against a populated table, and the Player.email audit is a data-quality
// checkpoint - even with missing emails auto-resolved by a placeholder (below), a genuine
// duplicate still needs a human decision, so it can't be folded into an unattended run.
//
// Usage (run from frontend/):
//   node scripts/migrate-to-squads.mjs stage1 --name "Dutch Lankan Shuttle Masters" --slug main
//   node scripts/migrate-to-squads.mjs stage2
//   node scripts/migrate-to-squads.mjs stage3
//
// Stage 0 (rehearsal) isn't a script - it's running stage1/stage2/stage3 against a disposable
// copy of the real data first, before ever pointing DATABASE_URL at production. Already done
// once against the local `brs-local-mysql` dev container's copy of the real production data (22
// players, 44 encounters, 195 score-history rows): stage1 backfilled cleanly and auto-assigned a
// placeholder email to the one real player who had none (id 19, "Pasan" -> "player19@placeholder
// .invalid" - a reserved-for-this-purpose domain per RFC 2606, guaranteed never to route mail),
// stage2 reported clean, and prisma/squad-migration/002_contract.sql (stage3) applied with no
// errors. The generated stage3 SQL was captured via `prisma migrate diff` against that rehearsal
// database, so it carries Prisma's own constraint/index names rather than a hand guess.
//
// Stage 1 - Expand: runs prisma/squad-migration/001_expand.sql (pure DDL: Squad/SquadAdmin
//   tables, squad_id/squadId added NULLABLE - safe while the current single-squad app code keeps
//   running, since it doesn't reference these yet), then creates one Squad row, backfills every
//   existing PLAYER/ENCOUNTER/Game row to it, assigns a deterministic placeholder email
//   (player<id>@placeholder.invalid) to any player with no email so the NOT NULL constraint in
//   Stage 2 has something to land on, and converts ALLOWED_ADMIN_EMAILS into SquadAdmin rows.
//
// Stage 2 - Data-quality gate: reports which players (if any) are still sitting on a placeholder
//   email - informational, not blocking, since Stage 1 already resolved the NOT NULL
//   requirement; someone should still go get that player's real email eventually. What DOES
//   block is a genuine duplicate email within a squad, which no placeholder can paper over -
//   fix those rows, then re-run this stage until it's clean.
//
// Stage 3 - Contract: runs prisma/squad-migration/002_contract.sql (the NOT NULL / unique /
//   foreign-key tightening), then reminds you to run `prisma db push` once as a final
//   confirm-nothing-drifted check (a no-op if the SQL file matches schema.prisma, which it does
//   here since it was generated from it).

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

function arg(name, fallback) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

// Strips `--` line comments and splits on `;` - sufficient for the two checked-in SQL files
// (plain DDL statements, no stored routines with an internal semicolon-bearing body).
function splitStatements(sql) {
  return sql
    .split('\n')
    .map((line) => (line.trim().startsWith('--') ? '' : line))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

// MySQL's error code for "column/key/table already exists" - the specific, expected shape of
// re-running 001_expand.sql's plain (non-guarded) DDL a second time. Anything else is a real
// failure and propagates.
const ALREADY_EXISTS_CODES = new Set(['1060', '1061', '1050', '1826']);

async function runSqlFile(tx, relativePath) {
  const sql = readFileSync(path.join(__dirname, '..', 'prisma', 'squad-migration', relativePath), 'utf8');
  for (const statement of splitStatements(sql)) {
    try {
      await tx.$executeRawUnsafe(statement);
    } catch (error) {
      const code = error?.meta?.code;
      if (ALREADY_EXISTS_CODES.has(code)) {
        console.log(`Already applied, skipping: ${statement.split('\n')[0]}...`);
        continue;
      }
      throw error;
    }
  }
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
    await runSqlFile(tx, '001_expand.sql');

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

    // Deterministic per-player placeholder, not a shared fake address - stays unique under the
    // new (squad_id, email) constraint and is obviously not a real inbox to anyone who sees it.
    const placeholderRows = await tx.$queryRawUnsafe(
      `SELECT id, name FROM PLAYER WHERE squad_id = ? AND (email IS NULL OR email = '')`,
      squadId
    );
    for (const p of placeholderRows) {
      await tx.$executeRawUnsafe(
        `UPDATE PLAYER SET email = ? WHERE id = ?`,
        `player${p.id}@placeholder.invalid`,
        p.id
      );
    }
    if (placeholderRows.length > 0) {
      console.log(
        `Assigned a placeholder email to ${placeholderRows.length} player(s) with none: ` +
          placeholderRows.map((p) => `"${p.name}" (id ${p.id})`).join(', ') +
          '. They keep their roster/history but can\'t log in until a real email replaces the placeholder.'
      );
    }

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

async function stage2() {
  console.log('Stage 2 (data-quality gate): checking PLAYER.email before Stage 3 tightens it to NOT NULL + unique per squad.');

  const placeholders = await prisma.$queryRawUnsafe(
    `SELECT id, name, squad_id, email FROM PLAYER WHERE email LIKE '%@placeholder.invalid'`
  );
  const duplicates = await prisma.$queryRawUnsafe(`
    SELECT squad_id, LOWER(email) AS email, COUNT(*) AS c, GROUP_CONCAT(id) AS player_ids
    FROM PLAYER
    WHERE email IS NOT NULL AND email != ''
    GROUP BY squad_id, LOWER(email)
    HAVING c > 1
  `);

  if (placeholders.length > 0) {
    console.log(`\nInformational - ${placeholders.length} player(s) still on a Stage 1 placeholder email (not blocking, but worth following up):`);
    for (const p of placeholders) console.log(`  - id ${p.id} "${p.name}" (squad ${p.squad_id}): ${p.email}`);
  }

  if (duplicates.length === 0) {
    console.log('\nNo duplicate emails within any squad. Safe to run Stage 3.');
    return;
  }

  console.log(`\n${duplicates.length} duplicate email group(s) within a squad - resolve before Stage 3 (a placeholder can't fix this, it needs a real decision):`);
  for (const d of duplicates) console.log(`  - "${d.email}" (squad ${d.squad_id}): player ids ${d.player_ids}`);
  console.log('\nRe-run this stage after fixing the rows above.');
  process.exitCode = 1;
}

async function stage3() {
  console.log('Stage 3 (contract): applying prisma/squad-migration/002_contract.sql.');
  await prisma.$transaction(async (tx) => {
    await runSqlFile(tx, '002_contract.sql');
  });
  console.log([
    'Stage 3 complete.',
    '',
    'Run `npx prisma db push` once more as a final confirm-nothing-drifted check - it should',
    'report the database is already in sync with schema.prisma (a no-op), since 002_contract.sql',
    'was generated from that same schema. Follow with Stage 4 (deploy the squad-aware',
    'application code).',
  ].join('\n'));
}

const stage = process.argv[2];
try {
  if (stage === 'stage1') await stage1();
  else if (stage === 'stage2') await stage2();
  else if (stage === 'stage3') await stage3();
  else {
    console.error('Usage: node scripts/migrate-to-squads.mjs <stage1|stage2|stage3> [--name "..."] [--slug ...]');
    process.exitCode = 1;
  }
} finally {
  await prisma.$disconnect();
}
