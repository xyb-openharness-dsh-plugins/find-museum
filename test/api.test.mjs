import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {
  mkdtemp,
  rm,
  readFile,
  rename,
  symlink,
  mkdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createService } from "../src/server.mjs";
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "find-museum-api-"));
  const service = createService(),
    server = http.createServer(service.handle);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;
  t.after(async () => {
    await new Promise((r) => server.close(r));
    service.close();
    await rm(dir, { recursive: true, force: true });
  });
  const req = async (path, method = "GET", data, origin = base) => {
    const r = await fetch(base + "/api/find-museum/" + path, {
      method,
      headers: {
        ...(origin ? { origin } : {}),
        "content-type": "application/json",
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    return { status: r.status, body: await r.json() };
  };
  return { dir, req, base, service };
}
async function configured(f) {
  assert.equal(
    (await f.req("configure", "POST", { dataRoot: f.dir })).status,
    200,
  );
  const r = await f.req("trips", "POST", {
    title: "周末寻馆",
    folder: f.dir,
    settings: { destination: "苏州", date: "2026-10-24", mode: "自驾" },
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.trip;
}
const stops = [
  { id: "amap-B020001285", day: 1, minutes: 240 },
  { id: "amap-B0FFMDQXZK", day: 1, minutes: 360 },
];
test("无资料目录也能查全国名录、分页和原型静态资源", async (t) => {
  const f = await fixture(t);
  const r = await f.req("catalog");
  assert.equal(r.body.total, 5535);
  assert.equal(r.body.rows.length, 40);
  assert.notEqual(
    (await f.req("catalog?page=2")).body.rows[0].museum_id,
    r.body.rows[0].museum_id,
  );
  assert.equal((await f.req("health")).body.configured, false);
  const page = await fetch(f.base + "/workbench/find-museum/");
  assert.equal(page.status, 200);
  assert.ok((await page.text()).includes("我的路线"));
});
test("写请求必须同源；目录不存在不自动创建", async (t) => {
  const f = await fixture(t);
  assert.equal(
    (
      await f.req(
        "configure",
        "POST",
        { dataRoot: f.dir },
        "https://other.example",
      )
    ).status,
    403,
  );
  assert.equal(
    (await f.req("configure", "POST", { dataRoot: f.dir }, null)).status,
    403,
  );
  assert.equal(
    (
      await f.req("configure", "POST", {
        dataRoot: join(f.dir, "does-not-exist"),
      })
    ).status,
    404,
  );
  assert.equal((await f.req("health")).body.configured, false);
});
test("旅行/收藏/映射保存后可重建服务恢复，陈旧写入不覆盖", async (t) => {
  const f = await fixture(t),
    a = await configured(f);
  const saved = await f.req("trip", "PUT", {
    ...a,
    stops,
    revision: a.revision,
  });
  assert.equal(saved.status, 200);
  assert.equal(
    (await f.req("trip", "PUT", { ...a, stops: [], revision: a.revision }))
      .status,
    409,
  );
  await f.req("favorites", "PUT", {
    id: stops[0].id,
    note: "关注瓷器",
    visited: true,
  });
  await f.req("session-projects", "POST", {
    sessionId: "test-session",
    project: a.id,
  });
  const other = createService();
  t.after(() => other.close());
  const server = http.createServer(other.handle);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = "http://127.0.0.1:" + server.address().port;
  await fetch(base + "/api/find-museum/configure", {
    method: "POST",
    headers: { origin: base, "content-type": "application/json" },
    body: JSON.stringify({ dataRoot: f.dir }),
  });
  const b = await (await fetch(base + "/api/find-museum/bootstrap")).json();
  assert.equal(b.favorites[0].note, "关注瓷器");
  assert.equal(b.bindings["test-session"], a.id);
  const read = await (
    await fetch(base + "/api/find-museum/trip?id=" + a.id)
  ).json();
  assert.deepEqual(read.trip.stops, stops);
  assert.equal(read.trip.revision, saved.body.trip.revision);
});
test("MD/CSV/JSON/HTML导出真实格式、哈希一致且归档可回顾", async (t) => {
  const f = await fixture(t),
    a = await configured(f);
  const s = (await f.req("trip", "PUT", { ...a, stops })).body.trip;
  for (const format of ["md", "csv", "json", "html"]) {
    const r = await f.req("export", "POST", {
      tripId: s.id,
      revision: s.revision,
      format,
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const download = await fetch(f.base + r.body.downloadUrl),
      b = Buffer.from(await download.arrayBuffer());
    assert.equal(download.status, 200);
    assert.equal(createHash("sha256").update(b).digest("hex"), r.body.sha256);
    assert.deepEqual(b, await readFile(join(s.settings.folder, r.body.path)));
    if (format === "json")
      assert.deepEqual(
        JSON.parse(b).stops.map((s) => s.id),
        stops.map((s) => s.id),
      );
    if (format === "html")
      assert.ok(b.toString().startsWith("<!doctype html>"));
    if (format === "csv") assert.ok(b.toString().startsWith('\uFEFF"顺序"'));
    if (format === "md") assert.ok(b.toString().startsWith("# 周末寻馆"));
  }
  assert.equal((await f.req("artifacts")).body.artifacts.length, 4);
});
test("候选必须有来源；确认后才进入馆址；陈旧输入拒绝", async (t) => {
  const f = await fixture(t),
    a = await configured(f);
  const v = {
    id: "test-venue",
    name: "合成测试馆",
    address: "合成测试地址",
    longitude: 120.6,
    latitude: 31.3,
    crs: "GCJ-02",
    sourceUrl: "https://museum.example/notice",
    openingStatus: "unknown",
  };
  assert.equal(
    (
      await f.req("candidates", "POST", {
        tripId: a.id,
        inputRevision: a.revision,
        venues: [{ ...v, sourceUrl: "" }],
      })
    ).status,
    400,
  );
  const c = await f.req("candidates", "POST", {
    tripId: a.id,
    inputRevision: a.revision,
    venues: [v],
  });
  assert.equal(c.status, 201);
  assert.ok(!(await f.req("bootstrap")).body.venues.some((x) => x.id === v.id));
  const id = c.body.candidates[0].id;
  assert.equal(
    (await f.req("review", "POST", { id, accept: true })).status,
    200,
  );
  assert.ok((await f.req("bootstrap")).body.venues.some((x) => x.id === v.id));
  assert.equal(
    (
      await f.req("candidates", "POST", {
        tripId: a.id,
        inputRevision: 1,
        venues: [v],
      })
    ).status,
    409,
  );
});
test("输出目录符号链接不能写出旅行目录", async (t) => {
  const f = await fixture(t),
    a = await configured(f);
  const s = (await f.req("trip", "PUT", { ...a, stops })).body.trip;
  const outside = join(f.dir, "outside");
  await mkdir(outside);
  await rename(
    join(s.settings.folder, "output"),
    join(s.settings.folder, "old-output"),
  );
  await symlink(outside, join(s.settings.folder, "output"), "dir");
  const r = await f.req("export", "POST", {
    tripId: s.id,
    revision: s.revision,
    format: "md",
  });
  assert.equal(r.status, 403);
});
test("馆址仅接受GCJ-02，日期必须真实且区间有序；候选可拒绝旧revision", async (t) => {
  const f = await fixture(t),
    a = await configured(f);
  const v = {
    id: "guarded-venue",
    name: "合成测试馆",
    address: "合成测试地址",
    longitude: 120.6,
    latitude: 31.3,
    crs: "GCJ-02",
    sourceUrl: "https://museum.example/notice",
    openingStatus: "unknown",
  };
  for (const patch of [
    { crs: "WGS84" },
    { validFrom: "2026-02-31" },
    { validFrom: "2026-10-20", validTo: "2026-10-01" },
  ])
    assert.equal(
      (
        await f.req("candidates", "POST", {
          tripId: a.id,
          inputRevision: a.revision,
          venues: [{ ...v, ...patch }],
        })
      ).status,
      400,
    );
  const r = await f.req("candidates", "POST", {
    tripId: a.id,
    inputRevision: a.revision,
    venues: [v],
  });
  const id = r.body.candidates[0].id;
  await f.req("trip", "PUT", { ...a, title: "新版旅行", stops: [] });
  assert.equal(
    (await f.req("review", "POST", { id, accept: true })).status,
    409,
  );
  assert.equal(
    (await f.req("review", "POST", { id, accept: false })).status,
    200,
  );
  assert.equal(
    (await f.req("bootstrap")).body.candidates[0].status,
    "rejected",
  );
});
test("重新定位既有馆址保留未提交更新的介绍，基础CSV可以下载", async (t) => {
  const f = await fixture(t),
    a = await configured(f);
  const before = (await f.req("bootstrap")).body.venues[0];
  const r = await f.req("candidates", "POST", {
    tripId: a.id,
    inputRevision: a.revision,
    venues: [
      {
        id: before.id,
        longitude: before.longitude,
        latitude: before.latitude,
        crs: "GCJ-02",
        name: before.name,
        address: before.address,
        sourceUrl: before.sourceUrl,
        openingStatus: "unknown",
      },
    ],
  });
  assert.equal(r.status, 201);
  const c = r.body.candidates[0];
  assert.equal(c.payload.intro, before.intro);
  await f.req("review", "POST", { id: c.id, accept: true });
  assert.equal(
    (await f.req("bootstrap")).body.venues.find((x) => x.id === before.id)
      .intro,
    before.intro,
  );
  const csv = await fetch(f.base + "/api/find-museum/catalog.csv");
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get("content-type"), /csv/);
  assert.ok((await csv.text()).includes("museum_id"));
});
test("批量选择馆址后按Day N顺序一次性加入路线；陈旧提交不覆盖", async (t) => {
  const f = await fixture(t),
    a = await configured(f);
  const venues = [
    {
      id: "batch-a",
      name: "合成甲馆",
      address: "测试甲",
      longitude: 120.6,
      latitude: 31.3,
      crs: "GCJ-02",
      sourceUrl: "https://museum.example/a",
      openingStatus: "unknown",
    },
    {
      id: "batch-b",
      name: "合成乙馆",
      address: "测试乙",
      longitude: 120.7,
      latitude: 31.4,
      crs: "GCJ-02",
      sourceUrl: "https://museum.example/b",
      openingStatus: "unknown",
    },
  ];
  const stops = [
    { id: "batch-b", day: 1, minutes: 480 },
    { id: "batch-a", day: 2, minutes: 240 },
  ];
  const p = { tripId: a.id, inputRevision: a.revision, venues, stops };
  assert.equal(
    (
      await f.req("plan-import", "POST", {
        ...p,
        stops: [{ ...stops[0], minutes: 120 }, stops[1]],
      })
    ).status,
    400,
  );
  assert.equal((await f.req("bootstrap")).body.venues.length, 5);
  const r = await f.req("plan-import", "POST", p);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.deepEqual(r.body.trip.stops, stops);
  assert.equal(r.body.venues.length, 7);
  assert.equal(
    r.body.candidates.filter((c) => c.status === "confirmed").length,
    2,
  );
  assert.equal((await f.req("plan-import", "POST", p)).status, 409);
  assert.equal(
    (await f.req("trip?id=" + a.id)).body.trip.stops[0].minutes,
    480,
  );
});

test("第一步建清单不需要day或minutes，第二步才保存规划；移出清单同步移出规划", async (t) => {
  const f = await fixture(t),
    a = await configured(f);
  const ids = stops.map((s) => s.id);
  const first = await f.req("selection", "PUT", {
    tripId: a.id,
    inputRevision: a.revision,
    ids,
  });
  assert.equal(first.status, 200);
  assert.deepEqual(first.body.trip.selections, ids);
  assert.deepEqual(first.body.trip.stops, []);
  const second = await f.req("trip", "PUT", { ...first.body.trip, stops });
  assert.equal(second.status, 200);
  assert.deepEqual(second.body.trip.stops, stops);
  const removed = await f.req("selection", "PUT", {
    tripId: a.id,
    inputRevision: second.body.trip.revision,
    ids: [ids[1]],
  });
  assert.equal(removed.status, 200);
  assert.equal(removed.body.trip.stops.length, 1);
  assert.equal(removed.body.trip.stops[0].id, ids[1]);
});
test("高德批量馆址可仅加入清单，不强行安排时长、Day N或创建会话", async (t) => {
  const f = await fixture(t),
    a = await configured(f);
  const v = {
    id: "list-only",
    name: "合成清单测试馆",
    address: "测试地址",
    longitude: 120.6,
    latitude: 31.3,
    crs: "GCJ-02",
    sourceUrl: "https://museum.example/a",
    openingStatus: "unknown",
  };
  const r = await f.req("selection-import", "POST", {
    tripId: a.id,
    inputRevision: a.revision,
    venues: [v],
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.deepEqual(r.body.trip.selections, [v.id]);
  assert.deepEqual(r.body.trip.stops, []);
  assert.equal(r.body.venues.length, 6);
  assert.deepEqual((await f.req("bootstrap")).body.bindings, {});
});
