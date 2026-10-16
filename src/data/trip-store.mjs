import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { validateStops } from "../domain/route.mjs";
export class RevisionConflict extends Error {
  constructor() {
    super("计划已在其它位置更新，请重新读取");
    this.code = "REVISION_CONFLICT";
  }
}
export class TripStore {
  constructor(dataRoot) {
    if (typeof dataRoot !== "string" || !dataRoot.trim())
      throw new TypeError("数据目录必须由调用方明确传入");
    this.root = resolve(dataRoot);
    mkdirSync(this.root, { recursive: true });
    this.db = new DatabaseSync(join(this.root, "trips.sqlite"));
    this.db.exec(
      "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;",
    );
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS migration_ledger(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS trip(id TEXT PRIMARY KEY,title TEXT NOT NULL,settings_json TEXT NOT NULL,revision INTEGER NOT NULL CHECK(revision>0),archived INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS trip_stop(trip_id TEXT NOT NULL REFERENCES trip(id) ON DELETE CASCADE,venue_id TEXT NOT NULL,position INTEGER NOT NULL,day INTEGER NOT NULL CHECK(day BETWEEN 1 AND 30),minutes INTEGER NOT NULL CHECK(minutes BETWEEN 15 AND 480),PRIMARY KEY(trip_id,venue_id),UNIQUE(trip_id,position)); CREATE TABLE IF NOT EXISTS trip_selection(trip_id TEXT NOT NULL REFERENCES trip(id),venue_id TEXT NOT NULL,position INTEGER NOT NULL,PRIMARY KEY(trip_id,venue_id)); INSERT OR IGNORE INTO migration_ledger VALUES(1,datetime('now'));`,
    );
  }
  create(title, settings = {}) {
    this.validate(title, settings);
    const id = randomUUID();
    this.db
      .prepare("INSERT INTO trip VALUES(?,?,?,1,0,?)")
      .run(id, title, JSON.stringify(settings), new Date().toISOString());
    return this.get(id);
  }
  validate(title, settings) {
    if (typeof title !== "string" || !title.trim() || title.length > 160)
      throw new TypeError("标题为1到160字符");
    if (
      !settings ||
      typeof settings !== "object" ||
      Array.isArray(settings) ||
      JSON.stringify(settings).length > 20000
    )
      throw new TypeError("计划设置无效或过大");
  }
  get(id) {
    const t = this.db.prepare("SELECT * FROM trip WHERE id=?").get(id);
    if (!t) return null;
    return {
      id: t.id,
      title: t.title,
      settings: JSON.parse(t.settings_json),
      revision: t.revision,
      archived: !!t.archived,
      updatedAt: t.updated_at,
      selections: this.db
        .prepare(
          "SELECT venue_id FROM trip_selection WHERE trip_id=? ORDER BY position",
        )
        .all(id)
        .map((x) => x.venue_id),
      stops: this.db
        .prepare(
          "SELECT venue_id AS id,day,minutes FROM trip_stop WHERE trip_id=? ORDER BY position",
        )
        .all(id)
        .map((x) => ({ ...x })),
    };
  }
  save(
    id,
    { title, settings, stops },
    expectedRevision,
    { transaction = true } = {},
  ) {
    this.validate(title, settings);
    const kinds = this.db
      .prepare("SELECT name FROM sqlite_master WHERE name='venue_override'")
      .get()
      ? new Map(this.overrides().map((v) => [v.id, v.kind || "museum"]))
      : new Map();
    validateStops(
      stops.map((s) => ({ ...s, kind: s.kind || kinds.get(s.id) || "museum" })),
    );
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1)
      throw new TypeError("必须提供当前revision");
    if (transaction) this.db.exec("BEGIN IMMEDIATE");
    try {
      const r = this.db
        .prepare(
          "UPDATE trip SET title=?,settings_json=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND archived=0",
        )
        .run(
          title,
          JSON.stringify(settings),
          new Date().toISOString(),
          id,
          expectedRevision,
        );
      if (r.changes !== 1) throw new RevisionConflict();
      this.db.prepare("DELETE FROM trip_stop WHERE trip_id=?").run(id);
      const insert = this.db.prepare("INSERT INTO trip_stop VALUES(?,?,?,?,?)");
      stops.forEach((s, i) => insert.run(id, s.id, i, s.day, s.minutes));
      for (const s of stops)
        this.db
          .prepare(
            "INSERT OR IGNORE INTO trip_selection VALUES(?,?,(SELECT COALESCE(MAX(position),-1)+1 FROM trip_selection WHERE trip_id=?))",
          )
          .run(id, s.id, id);
      if (transaction) this.db.exec("COMMIT");
      return this.get(id);
    } catch (e) {
      if (transaction) this.db.exec("ROLLBACK");
      throw e;
    }
  }
  archive(id, expectedRevision) {
    const r = this.db
      .prepare(
        "UPDATE trip SET archived=1,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND archived=0",
      )
      .run(new Date().toISOString(), id, expectedRevision);
    if (r.changes !== 1) throw new RevisionConflict();
    return this.get(id);
  }
  close() {
    this.db.close();
  }
}

// Extra repositories share a user-chosen database, not browser-local state.
TripStore.prototype.prepareBusinessTables = function () {
  this.db.exec(`
 CREATE TABLE IF NOT EXISTS favorite(venue_id TEXT PRIMARY KEY,payload TEXT NOT NULL,updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS artifact(id TEXT PRIMARY KEY,trip_id TEXT REFERENCES trip(id),kind TEXT NOT NULL,path TEXT NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS candidate(id TEXT PRIMARY KEY,trip_id TEXT REFERENCES trip(id),payload TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS venue_override(id TEXT PRIMARY KEY,payload TEXT NOT NULL,updated_at TEXT NOT NULL);
 INSERT OR IGNORE INTO migration_ledger VALUES(2,datetime('now'));
`);
  if (
    !this.db
      .prepare("SELECT version FROM migration_ledger WHERE version=3")
      .get()
  ) {
    this.db.exec(
      `BEGIN IMMEDIATE; UPDATE trip SET revision=revision+1 WHERE id IN (SELECT trip_id FROM trip_stop WHERE minutes<240 OR minutes>480); UPDATE trip_stop SET minutes=MIN(480,MAX(240,minutes)); INSERT INTO migration_ledger VALUES(3,datetime('now')); COMMIT;`,
    );
  }
  if (
    !this.db
      .prepare("SELECT version FROM migration_ledger WHERE version=4")
      .get()
  ) {
    this.db.exec(
      `BEGIN IMMEDIATE; INSERT OR IGNORE INTO trip_selection SELECT trip_id,venue_id,position FROM trip_stop; INSERT INTO migration_ledger VALUES(4,datetime('now')); COMMIT;`,
    );
  }
  if (
    !this.db
      .prepare("SELECT version FROM migration_ledger WHERE version=5")
      .get()
  ) {
    this.db
      .prepare("VACUUM INTO ?")
      .run(join(this.root, "trips.pre-v5-" + Date.now() + ".sqlite"));
    this.db.exec(`BEGIN IMMEDIATE;
      ALTER TABLE trip_stop RENAME TO trip_stop_v4;
      CREATE TABLE trip_stop(trip_id TEXT NOT NULL REFERENCES trip(id) ON DELETE CASCADE,venue_id TEXT NOT NULL,position INTEGER NOT NULL,day INTEGER NOT NULL CHECK(day BETWEEN 1 AND 30),minutes INTEGER NOT NULL CHECK(minutes BETWEEN 15 AND 480),PRIMARY KEY(trip_id,venue_id),UNIQUE(trip_id,position));
      INSERT INTO trip_stop SELECT * FROM trip_stop_v4; DROP TABLE trip_stop_v4;
      CREATE TABLE roadbook_version(id TEXT PRIMARY KEY,trip_id TEXT NOT NULL REFERENCES trip(id),version INTEGER NOT NULL,input_revision INTEGER NOT NULL,snapshot TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(trip_id,version),UNIQUE(trip_id,input_revision));
      CREATE TABLE recommendation_cache(cache_key TEXT PRIMARY KEY,payload TEXT NOT NULL,created_at TEXT NOT NULL);
      INSERT INTO migration_ledger VALUES(5,datetime('now')); COMMIT;`);
  }
};
TripStore.prototype.importPlan = function (t, venues, stops) {
  this.db.exec("BEGIN IMMEDIATE");
  try {
    const saved = this.save(
      t.id,
      { title: t.title, settings: t.settings, stops },
      t.revision,
      { transaction: false },
    );
    for (const venue of venues) {
      const payload = { ...venue, inputRevision: t.revision };
      const id = this.addCandidate(t.id, payload);
      this.db
        .prepare("UPDATE candidate SET status='confirmed' WHERE id=?")
        .run(id);
      this.db
        .prepare(
          "INSERT INTO venue_override VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at",
        )
        .run(venue.id, JSON.stringify(payload), new Date().toISOString());
    }
    this.db.exec("COMMIT");
    return saved;
  } catch (e) {
    this.db.exec("ROLLBACK");
    throw e;
  }
};
TripStore.prototype.list = function () {
  return this.db
    .prepare(
      "SELECT id,title,revision,updated_at AS updatedAt FROM trip WHERE archived=0 ORDER BY updated_at DESC",
    )
    .all()
    .map((x) => ({ ...x }));
};
TripStore.prototype.favorites = function () {
  return this.db
    .prepare(
      "SELECT venue_id AS id,payload FROM favorite ORDER BY updated_at DESC",
    )
    .all()
    .map((x) => ({ id: x.id, ...JSON.parse(x.payload) }));
};
TripStore.prototype.putFavorite = function (id, value) {
  this.db
    .prepare(
      "INSERT INTO favorite VALUES(?,?,?) ON CONFLICT(venue_id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at",
    )
    .run(id, JSON.stringify(value), new Date().toISOString());
};
TripStore.prototype.deleteFavorite = function (id) {
  this.db.prepare("DELETE FROM favorite WHERE venue_id=?").run(id);
};
TripStore.prototype.addArtifact = function (tripId, kind, path, payload) {
  const id = randomUUID();
  this.db
    .prepare("INSERT INTO artifact VALUES(?,?,?,?,?,?)")
    .run(
      id,
      tripId,
      kind,
      path,
      JSON.stringify(payload),
      new Date().toISOString(),
    );
  return id;
};
TripStore.prototype.artifacts = function () {
  return this.db
    .prepare("SELECT * FROM artifact ORDER BY created_at DESC LIMIT 200")
    .all()
    .map((x) => ({ ...x, payload: JSON.parse(x.payload) }));
};
TripStore.prototype.candidates = function () {
  return this.db
    .prepare("SELECT * FROM candidate ORDER BY created_at DESC LIMIT 200")
    .all()
    .map((x) => ({ ...x, payload: JSON.parse(x.payload) }));
};
TripStore.prototype.addCandidate = function (tripId, payload) {
  const id = randomUUID();
  this.db
    .prepare(
      "INSERT INTO candidate(id,trip_id,payload,created_at) VALUES(?,?,?,?)",
    )
    .run(id, tripId, JSON.stringify(payload), new Date().toISOString());
  return id;
};
TripStore.prototype.overrides = function () {
  return this.db
    .prepare("SELECT payload FROM venue_override")
    .all()
    .map((x) => JSON.parse(x.payload));
};
TripStore.prototype.reviewCandidate = function (id, accept) {
  this.db.exec("BEGIN IMMEDIATE");
  try {
    const c = this.db
      .prepare("SELECT * FROM candidate WHERE id=? AND status='pending'")
      .get(id);
    if (!c) throw new Error("候选不存在或已经处理");
    const p = JSON.parse(c.payload);
    if (accept)
      this.db
        .prepare(
          "INSERT INTO venue_override VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at",
        )
        .run(p.id, JSON.stringify(p), new Date().toISOString());
    this.db
      .prepare("UPDATE candidate SET status=? WHERE id=?")
      .run(accept ? "confirmed" : "rejected", id);
    this.db.exec("COMMIT");
    return p;
  } catch (e) {
    this.db.exec("ROLLBACK");
    throw e;
  }
};

TripStore.prototype.saveSelection = function (
  t,
  ids,
  { transaction = true } = {},
) {
  if (
    !Array.isArray(ids) ||
    ids.length > 500 ||
    ids.some((id) => typeof id !== "string") ||
    new Set(ids).size !== ids.length
  )
    throw new TypeError("博物馆清单无效或重复");
  if (transaction) this.db.exec("BEGIN IMMEDIATE");
  try {
    const r = this.db
      .prepare(
        "UPDATE trip SET revision=revision+1,updated_at=? WHERE id=? AND revision=? AND archived=0",
      )
      .run(new Date().toISOString(), t.id, t.revision);
    if (r.changes !== 1) throw new RevisionConflict();
    this.db.prepare("DELETE FROM trip_selection WHERE trip_id=?").run(t.id);
    ids.forEach((id, i) =>
      this.db
        .prepare("INSERT INTO trip_selection VALUES(?,?,?)")
        .run(t.id, id, i),
    );
    this.db
      .prepare(
        "DELETE FROM trip_stop WHERE trip_id=? AND venue_id NOT IN (SELECT venue_id FROM trip_selection WHERE trip_id=?)",
      )
      .run(t.id, t.id);
    if (transaction) this.db.exec("COMMIT");
    return this.get(t.id);
  } catch (e) {
    if (transaction) this.db.exec("ROLLBACK");
    throw e;
  }
};
TripStore.prototype.importSelection = function (t, venues) {
  this.db.exec("BEGIN IMMEDIATE");
  try {
    const saved = this.saveSelection(
      t,
      [...new Set([...t.selections, ...venues.map((v) => v.id)])],
      { transaction: false },
    );
    for (const venue of venues) {
      const payload = { ...venue, inputRevision: t.revision };
      const id = this.addCandidate(t.id, payload);
      this.db
        .prepare("UPDATE candidate SET status='confirmed' WHERE id=?")
        .run(id);
      this.db
        .prepare(
          "INSERT INTO venue_override VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at",
        )
        .run(venue.id, JSON.stringify(payload), new Date().toISOString());
    }
    this.db.exec("COMMIT");
    return saved;
  } catch (e) {
    this.db.exec("ROLLBACK");
    throw e;
  }
};

TripStore.prototype.savePlaces = function (places) {
  const stmt = this.db.prepare(
    "INSERT INTO venue_override VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at",
  );
  for (const place of places)
    stmt.run(place.id, JSON.stringify(place), new Date().toISOString());
};
TripStore.prototype.saveRoadbook = function (t, places) {
  const existing = this.db
    .prepare(
      "SELECT * FROM roadbook_version WHERE trip_id=? AND input_revision=?",
    )
    .get(t.id, t.revision);
  if (existing) return { ...existing, snapshot: JSON.parse(existing.snapshot) };
  const id = randomUUID(),
    version = this.db
      .prepare(
        "SELECT COALESCE(MAX(version),0)+1 AS v FROM roadbook_version WHERE trip_id=?",
      )
      .get(t.id).v;
  const snapshot = {
    title: t.title,
    tripId: t.id,
    revision: t.revision,
    status: t.stops.length ? "planned" : "draft",
    destination: t.settings.destination,
    date: t.settings.date,
    mode: t.settings.mode,
    selections: (t.selections || [])
      .map((id) => places.find((v) => v.id === id))
      .filter(Boolean),
    stops: t.stops.map((s) => ({ ...places.find((v) => v.id === s.id), ...s })),
  };
  const now = new Date().toISOString();
  this.db
    .prepare("INSERT INTO roadbook_version VALUES(?,?,?,?,?,?)")
    .run(id, t.id, version, t.revision, JSON.stringify(snapshot), now);
  return {
    id,
    trip_id: t.id,
    version,
    input_revision: t.revision,
    snapshot,
    created_at: now,
  };
};
TripStore.prototype.roadbooks = function () {
  return this.db
    .prepare("SELECT * FROM roadbook_version ORDER BY created_at DESC")
    .all()
    .map((r) => ({ ...r, snapshot: JSON.parse(r.snapshot) }));
};
