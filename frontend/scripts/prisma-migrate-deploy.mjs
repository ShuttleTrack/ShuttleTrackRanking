#!/usr/bin/env node
// Apply Prisma migrations. If this database already has ranking/session tables but no
// `_prisma_migrations` row for 20250202125811_init (common for existing `brs` DBs),
// record that migration as applied so `migrate deploy` does not try to CREATE TABLE Game.

import { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.join(__dirname, '..');
const INIT_MIGRATION = '20250202125811_init';

const prisma = new PrismaClient();

function runPrisma(args) {
  execSync(`npx prisma ${args}`, {
    cwd: frontendRoot,
    stdio: 'inherit',
    env: process.env,
  });
}

async function rankingTablesExist() {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*) AS c
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_name IN ('PLAYER', 'ENCOUNTER', 'SCORE_HISTORY')
  `);
  return Number(rows[0]?.c ?? 0) >= 1;
}

async function gameTableExists() {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*) AS c
    FROM information_schema.tables
    WHERE table_schema = DATABASE() AND table_name = 'Game'
  `);
  return Number(rows[0]?.c ?? 0) > 0;
}

async function migrationRecorded(name) {
  const table = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*) AS c
    FROM information_schema.tables
    WHERE table_schema = DATABASE() AND table_name = '_prisma_migrations'
  `);
  if (Number(table[0]?.c ?? 0) === 0) {
    return false;
  }
  const rows = await prisma.$queryRawUnsafe(
    `SELECT migration_name FROM _prisma_migrations WHERE migration_name = ? LIMIT 1`,
    name
  );
  return rows.length > 0;
}

async function shouldBaselineInit() {
  if (await migrationRecorded(INIT_MIGRATION)) {
    return false;
  }
  return (await gameTableExists()) || (await rankingTablesExist());
}

async function main() {
  if (await shouldBaselineInit()) {
    console.log(
      `Baselining ${INIT_MIGRATION} (existing tables, no Prisma migration history).`
    );
    runPrisma(`migrate resolve --applied ${INIT_MIGRATION}`);
  }

  runPrisma('migrate deploy');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
