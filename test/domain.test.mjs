import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  distanceKm,
  withinRadius,
  moveStop,
  validateStops,
  toWgs84,
  csvText,
} from "../src/domain/route.mjs";
import { TripStore, RevisionConflict } from "../src/data/trip-store.mjs";
const p = (longitude, latitude, crs = "GCJ-02") => ({
  longitude,
  latitude,
  crs,
});
test("距离计算同点/对称且拒绝空值和坐标系混用", () => {
  const a = p(120.6, 31.3),
    b = p(120.7, 31.4);
  assert.equal(distanceKm(a, a), 0);
  assert.ok(distanceKm(a, b) > 14 && distanceKm(a, b) < 15);
  assert.equal(distanceKm(a, b), distanceKm(b, a));
  assert.throws(() => distanceKm(a, p(null, 31)));
  assert.throws(() => distanceKm(a, p(120, 31, "WGS84")));
});
test("100km边界按实际距离筛选；缺坐标保留为待定位", () => {
  const a = p(120, 31),
    b = { ...p(120.8, 31), id: "inside" },
    c = { ...p(122, 31), id: "outside" },
    missing = { id: "missing" };
  const r = withinRadius([c, b, missing], a, 100);
  assert.deepEqual(
    r.located.map((x) => x.id),
    ["inside"],
  );
  assert.deepEqual(r.unlocated, [missing]);
  assert.throws(() => withinRadius([], a, -1));
  assert.equal(withinRadius([b], a, distanceKm(a, b)).located.length, 1);
});
test("GCJ-02转换保留原点位，不用于同坐标系混算", () => {
  const a = p(120.627856, 31.322948),
    b = toWgs84(a);
  assert.equal(b.crs, "WGS84");
  assert.ok(
    b.longitude < a.longitude && Math.abs(b.longitude - a.longitude) < 0.02,
  );
  assert.equal(a.crs, "GCJ-02");
  assert.throws(() => distanceKm(a, b));
});
test("路线排序不改写原数组、边界不丢站点、校验拒绝重复", () => {
  const a = [
    { id: "a", day: 1, minutes: 240 },
    { id: "b", day: 1, minutes: 360 },
  ];
  assert.deepEqual(
    moveStop(a, "a", 1).map((x) => x.id),
    ["b", "a"],
  );
  assert.equal(a[0].id, "a");
  assert.deepEqual(moveStop(a, "a", -1), a);
  assert.throws(() => validateStops([a[0], a[0]]));
  assert.throws(() => validateStops([{ id: "x", day: 0, minutes: 60 }]));
});
test("CSV按手动顺序导出并处理公式、引号和换行", () => {
  const csv = csvText([
    { name: "=cmd", address: 'a,"b"\nc', day: 2 },
    { name: "第二馆", day: 1 },
  ]);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes("'=cmd"));
  assert.ok(csv.includes('a,""b""\nc'));
  assert.ok(csv.indexOf("'=cmd") < csv.indexOf("第二馆"));
});
async function storeFixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "museum-trips-"));
  let db = new TripStore(dir);
  t.after(async () => {
    try {
      db.close();
    } catch {}
    await rm(dir, { recursive: true, force: true });
  });
  return {
    dir,
    get db() {
      return db;
    },
    reopen() {
      db.close();
      db = new TripStore(dir);
      return db;
    },
  };
}
test("SQLite重启后保持手动顺序、日期和独立计划", async (t) => {
  const f = await storeFixture(t),
    a = f.db.create("周末寻馆", { date: "2026-10-24" }),
    b = f.db.create("另一趟");
  const stops = [
    { id: "b", day: 1, minutes: 240 },
    { id: "a", day: 2, minutes: 360 },
  ];
  const saved = f.db.save(
    a.id,
    { title: a.title, settings: a.settings, stops },
    1,
  );
  assert.equal(saved.revision, 2);
  f.reopen();
  assert.deepEqual(f.db.get(a.id).stops, stops);
  assert.equal(f.db.get(a.id).settings.date, "2026-10-24");
  assert.deepEqual(f.db.get(b.id).stops, []);
});
test("SQLite陈旧revision失败不覆盖已保存计划", async (t) => {
  const f = await storeFixture(t),
    a = f.db.create("第一次");
  f.db.save(a.id, { title: "新版本", settings: {}, stops: [] }, 1);
  assert.throws(
    () => f.db.save(a.id, { title: "陈旧版本", settings: {}, stops: [] }, 1),
    RevisionConflict,
  );
  assert.equal(f.db.get(a.id).title, "新版本");
});
test("归档保留原数据且拒绝继续写入", async (t) => {
  const f = await storeFixture(t),
    a = f.db.create("保留资料");
  const b = f.db.archive(a.id, 1);
  assert.equal(b.archived, true);
  assert.throws(
    () => f.db.save(a.id, { title: "误写", settings: {}, stops: [] }, 2),
    RevisionConflict,
  );
  assert.equal(f.db.get(a.id).title, "保留资料");
});
test("旧短时参观迁移到4小时且保留顺序，批量导入失败整笔回滚", async (t) => {
  const f = await storeFixture(t),
    a = f.db.create("迁移与事务");
  f.db.db.exec("PRAGMA ignore_check_constraints=ON");
  f.db.db
    .prepare("INSERT INTO trip_stop VALUES(?,?,?,?,?)")
    .run(a.id, "old", 0, 2, 90);
  f.db.db.exec("PRAGMA ignore_check_constraints=OFF");
  f.db.prepareBusinessTables();
  assert.equal(f.db.get(a.id).stops[0].minutes, 240);
  assert.equal(f.db.get(a.id).stops[0].day, 2);
  assert.equal(f.db.get(a.id).revision, 2);
  f.db.prepareBusinessTables();
  assert.equal(f.db.get(a.id).revision, 2);
  f.db.db.exec(
    "CREATE TRIGGER reject_test BEFORE INSERT ON venue_override WHEN NEW.id='bad' BEGIN SELECT RAISE(ABORT,'injected failure'); END;",
  );
  const current = f.db.get(a.id);
  assert.throws(
    () =>
      f.db.importPlan(
        current,
        [{ id: "ok" }, { id: "bad" }],
        [
          { id: "ok", day: 1, minutes: 240 },
          { id: "bad", day: 2, minutes: 480 },
        ],
      ),
    /injected failure/,
  );
  assert.equal(f.db.get(a.id).revision, current.revision);
  assert.equal(f.db.get(a.id).stops[0].id, "old");
  assert.equal(f.db.candidates().length, 0);
  assert.equal(f.db.overrides().length, 0);
});

test("迁移6保留既有档案内容和ID，同路线资料新版本不改旅行revision，重启仍幂等", async (t) => {
  const f = await storeFixture(t), trip = f.db.create("迁移6验收");
  f.db.prepareBusinessTables();
  const snapshot={title:"旧版",revision:trip.revision,selections:[],stops:[]};
  f.db.db.exec(`DROP TABLE roadbook_state; DROP TABLE roadbook_check; DROP TABLE roadbook_version; DELETE FROM migration_ledger WHERE version>=6;
    CREATE TABLE roadbook_version(id TEXT PRIMARY KEY,trip_id TEXT NOT NULL REFERENCES trip(id),version INTEGER NOT NULL,input_revision INTEGER NOT NULL,snapshot TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(trip_id,version),UNIQUE(trip_id,input_revision));`);
  f.db.db.prepare("INSERT INTO roadbook_version VALUES(?,?,?,?,?,?)").run("legacy-book",trip.id,1,trip.revision,JSON.stringify(snapshot),"2026-10-15T00:00:00Z");
  let db=f.reopen();
  db.prepareBusinessTables();
  const old=db.roadbooks().find(b=>b.id==="legacy-book");
  assert.deepEqual(old.snapshot,snapshot);
  const next=db.saveRoadbookSnapshot(trip.id,trip.revision,{...snapshot,preflight:{checkedAt:"2026-10-16T00:00:00Z"}});
  assert.equal(next.version,2); assert.equal(db.get(trip.id).revision,trip.revision);
  db=f.reopen();
  db.prepareBusinessTables();
  assert.equal(db.saveRoadbookSnapshot(trip.id,trip.revision,next.snapshot).id,next.id);
  assert.deepEqual(db.roadbooks().find(b=>b.id==="legacy-book").snapshot,snapshot);
});
