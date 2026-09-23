// A small stateful in-memory stand-in for the Prisma client, covering exactly the query shapes
// lib/gameDay/** uses. The game-day rules are about how rows evolve across several writes (a
// vote, a promotion, a transfer, a confirmation), which call-shape assertions on vi.fn() mocks
// cannot express - so these tests run the real modules against real state instead.
//
// $transaction serialises every transaction behind one mutex (standing in for the GameDay row
// lock - all of these tests touch a single game day at a time) and rolls the store back if the
// callback throws, so a rejected write leaves no phantom row.
//
// Not a test file itself (vitest only picks up *.test.ts); imported by them.

type Row = Record<string, any>;
type Where = Record<string, any>;

const MODELS = [
  'player',
  'slotReplacement',
  'squad',
  'gameDay',
  'gameDayVote',
  'gameDayOpenSlot',
  'gameDaySlotNomination',
  'game',
] as const;
type ModelName = (typeof MODELS)[number];

// Compound unique keys used in `where`, and the fields that must be unique together.
const COMPOUND_KEYS: Record<string, string[]> = {
  gameDayId_playerId: ['gameDayId', 'playerId'],
  squadId_gameDate: ['squadId', 'gameDate'],
  squadId_email: ['squadId', 'email'],
};

const UNIQUES: Partial<Record<ModelName, string[][]>> = {
  gameDay: [['squadId', 'gameDate']],
  gameDayVote: [['gameDayId', 'playerId']],
  gameDayOpenSlot: [['gameDayId', 'playerId']],
  game: [['gameDayId']],
};

function defaultsFor(model: ModelName, now: Date): Row {
  switch (model) {
    case 'gameDay':
      return {
        status: 'VOTING_OPEN',
        minPlayers: null,
        announcedAt: null,
        remindedAt: null,
        openSlotPingedAt: null,
        votingClosedAt: null,
        openSlotPingSent: false,
        announcedVacancies: null,
        vacancyAnnouncedAt: null,
        createdAt: now,
        updatedAt: now,
      };
    case 'gameDayVote':
      return { inheritedFromPlayerId: null, votedAt: now, updatedAt: now };
    case 'gameDayOpenSlot':
      return { status: 'WAITING', source: null, joinedAt: now, assignedAt: null, withdrawnAt: null };
    case 'gameDaySlotNomination':
      return { createdAt: now, endedAt: null, endReason: null, announcedAt: null, retractedAt: null };
    case 'player':
      return { playerType: 'FULLTIME', playerStatus: 'ACTIVE', colorHex: 'aaaaaa', rankScore: 1000, playerRank: 1 };
    case 'slotReplacement':
      return { cancelledAt: null, createdAt: now, cancellationRequestedAt: null, cancellationRequestedEndDate: null };
    case 'squad':
      return { enabled: true, isPublic: true, schedule: null, gameDayOps: null, createdAt: now, updatedAt: now };
    case 'game':
      return { gameDayId: null, createdAt: now, updatedAt: now, status: 'DRAFT' };
  }
}

function isDate(v: unknown): v is Date {
  return v instanceof Date;
}

function eq(a: unknown, b: unknown): boolean {
  if (isDate(a) && isDate(b)) return a.getTime() === b.getTime();
  return a === b;
}

function cmp(a: any, b: any): number {
  const x = isDate(a) ? a.getTime() : a;
  const y = isDate(b) ? b.getTime() : b;
  return x < y ? -1 : x > y ? 1 : 0;
}

function matchesField(value: unknown, condition: any): boolean {
  if (condition === null || typeof condition !== 'object' || isDate(condition)) {
    return condition === null ? value === null || value === undefined : eq(value, condition);
  }
  for (const [op, operand] of Object.entries(condition)) {
    switch (op) {
      case 'equals':
        if (!eq(value, operand)) return false;
        break;
      case 'in':
        if (!(operand as unknown[]).some((o) => eq(value, o))) return false;
        break;
      case 'notIn':
        if ((operand as unknown[]).some((o) => eq(value, o))) return false;
        break;
      case 'not':
        if (matchesField(value, operand)) return false;
        break;
      case 'lt':
        if (value === null || value === undefined || cmp(value, operand) >= 0) return false;
        break;
      case 'lte':
        if (value === null || value === undefined || cmp(value, operand) > 0) return false;
        break;
      case 'gt':
        if (value === null || value === undefined || cmp(value, operand) <= 0) return false;
        break;
      case 'gte':
        if (value === null || value === undefined || cmp(value, operand) < 0) return false;
        break;
      default:
        throw new Error(`fakePrisma: unsupported operator ${op}`);
    }
  }
  return true;
}

function matches(row: Row, where: Where | undefined): boolean {
  if (!where) return true;
  for (const [key, condition] of Object.entries(where)) {
    if (key === 'OR') {
      if (!(condition as Where[]).some((w) => matches(row, w))) return false;
    } else if (key === 'AND') {
      if (!(condition as Where[]).every((w) => matches(row, w))) return false;
    } else if (COMPOUND_KEYS[key]) {
      for (const field of COMPOUND_KEYS[key]) {
        if (!eq(row[field], condition[field])) return false;
      }
    } else if (!matchesField(row[key], condition)) {
      return false;
    }
  }
  return true;
}

function sortRows(rows: Row[], orderBy: any): Row[] {
  if (!orderBy) return rows;
  const orders: Record<string, 'asc' | 'desc'>[] = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...rows].sort((a, b) => {
    for (const order of orders) {
      const [field, dir] = Object.entries(order)[0];
      const c = cmp(a[field], b[field]);
      if (c !== 0) return dir === 'desc' ? -c : c;
    }
    return 0;
  });
}

function clone<T>(value: T): T {
  if (isDate(value)) return new Date(value.getTime()) as T;
  if (Array.isArray(value)) return value.map(clone) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clone(v)])) as T;
  }
  return value;
}

export class UniqueConstraintError extends Error {
  code = 'P2002';
  constructor(model: string, fields: string[]) {
    super(`Unique constraint failed on ${model}(${fields.join(', ')})`);
  }
}

export interface FakePrisma {
  store: Record<ModelName, Row[]>;
  reset(): void;
  // Loosely typed on purpose: tests read whichever fields they seeded.
  insert(model: ModelName, row: Row): any;
  [model: string]: any;
}

export function createFakePrisma(): FakePrisma {
  let store: Record<ModelName, Row[]> = Object.fromEntries(MODELS.map((m) => [m, []])) as any;
  let ids: Record<ModelName, number> = Object.fromEntries(MODELS.map((m) => [m, 0])) as any;
  let lock: Promise<void> = Promise.resolve();

  const project = (row: Row, args: any): Row => {
    let out: Row = clone(row);
    if (args?.include?.squad) out.squad = clone(store.squad.find((s) => s.id === row.squadId));
    if (args?.select) {
      out = Object.fromEntries(Object.keys(args.select).filter((k) => args.select[k]).map((k) => [k, out[k]]));
    }
    return out;
  };

  const checkUnique = (model: ModelName, candidate: Row, selfId?: number) => {
    for (const fields of UNIQUES[model] ?? []) {
      if (fields.some((f) => candidate[f] === null || candidate[f] === undefined)) continue;
      const clash = store[model].find((r) => r.id !== selfId && fields.every((f) => eq(r[f], candidate[f])));
      if (clash) throw new UniqueConstraintError(model, fields);
    }
  };

  const insert = (model: ModelName, data: Row): Row => {
    const row = { ...defaultsFor(model, new Date()), ...clone(data) };
    if (row.id === undefined) row.id = ++ids[model];
    else ids[model] = Math.max(ids[model], row.id);
    checkUnique(model, row);
    store[model].push(row);
    return row;
  };

  const findOne = (model: ModelName, where: Where) => store[model].find((r) => matches(r, where));

  const applyUpdate = (model: ModelName, row: Row, data: Row) => {
    // Prisma treats an undefined field as "leave unchanged", not "set to undefined".
    const defined = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
    const next = { ...row, ...clone(defined) };
    if ('updatedAt' in row) next.updatedAt = new Date();
    checkUnique(model, next, row.id);
    Object.assign(row, next);
    return row;
  };

  const delegate = (model: ModelName) => ({
    findMany: async (args: any = {}) =>
      sortRows(store[model].filter((r) => matches(r, args.where)), args.orderBy).map((r) => project(r, args)),
    findFirst: async (args: any = {}) => {
      const row = sortRows(store[model].filter((r) => matches(r, args.where)), args.orderBy)[0];
      return row ? project(row, args) : null;
    },
    findUnique: async (args: any) => {
      const row = findOne(model, args.where);
      return row ? project(row, args) : null;
    },
    findUniqueOrThrow: async (args: any) => {
      const row = findOne(model, args.where);
      if (!row) throw new Error(`fakePrisma: ${model} not found`);
      return project(row, args);
    },
    count: async (args: any = {}) => store[model].filter((r) => matches(r, args.where)).length,
    create: async (args: any) => project(insert(model, args.data), args),
    update: async (args: any) => {
      const row = findOne(model, args.where);
      if (!row) throw new Error(`fakePrisma: ${model} to update not found`);
      return project(applyUpdate(model, row, args.data), args);
    },
    updateMany: async (args: any) => {
      const rows = store[model].filter((r) => matches(r, args.where));
      rows.forEach((r) => applyUpdate(model, r, args.data));
      return { count: rows.length };
    },
    upsert: async (args: any) => {
      const row = findOne(model, args.where);
      if (row) return project(applyUpdate(model, row, args.update), args);
      return project(insert(model, args.create), args);
    },
    delete: async (args: any) => {
      const row = findOne(model, args.where);
      if (!row) throw new Error(`fakePrisma: ${model} to delete not found`);
      store[model] = store[model].filter((r) => r !== row);
      return clone(row);
    },
    deleteMany: async (args: any = {}) => {
      const before = store[model].length;
      store[model] = store[model].filter((r) => !matches(r, args.where));
      return { count: before - store[model].length };
    },
  });

  const client: FakePrisma = {
    get store() {
      return store;
    },
    reset() {
      store = Object.fromEntries(MODELS.map((m) => [m, []])) as any;
      ids = Object.fromEntries(MODELS.map((m) => [m, 0])) as any;
      lock = Promise.resolve();
    },
    insert,
    $queryRaw: async () => [],
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const previous = lock;
      let release!: () => void;
      lock = new Promise<void>((resolve) => (release = resolve));
      await previous;
      const snapshot = clone(store);
      const snapshotIds = { ...ids };
      try {
        return await fn(client);
      } catch (error) {
        store = snapshot;
        ids = snapshotIds;
        throw error;
      } finally {
        release();
      }
    },
  } as FakePrisma;
  for (const model of MODELS) client[model] = delegate(model);
  return client;
}
