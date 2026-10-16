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
async function fixture(t, options = {}) {
  const dir = await mkdtemp(join(tmpdir(), "find-museum-api-"));
  const service = createService(options),
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
  assert.ok((await page.text()).includes("设计路书"));
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
  assert.equal(csv.status, 404);
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

test("通用地点收藏、分类时长与旧数据兼容；重复保存保留去过笔记", async (t) => {
  const f = await fixture(t),
    a = await configured(f);
  const place = {
    id: "food-test",
    kind: "food",
    provider: "manual",
    unlocated: true,
    name: "测试餐馆",
    city: "苏州",
    address: "",
    sourceUrl: "",
    openingStatus: "unknown",
  };
  const created = await f.req("places", "POST", {
    places: [place],
    tripId: a.id,
    revision: a.revision,
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.deepEqual(created.body.trip.selections, [place.id]);
  assert.deepEqual(created.body.trip.stops, []);
  await f.req("favorites", "PUT", {
    id: place.id,
    visited: true,
    note: "私人备注，不应分享",
  });
  const again = await f.req("places", "POST", { places: [place] });
  assert.equal(again.body.favorites[0].visited, true);
  assert.equal(again.body.favorites[0].note, "私人备注，不应分享");
  const plan = await f.req("trip", "PUT", {
    ...created.body.trip,
    stops: [{ id: place.id, day: 1, minutes: 60 }],
  });
  assert.equal(plan.status, 200, JSON.stringify(plan.body));
  assert.equal(plan.body.trip.stops[0].minutes, 60);
  const bad = await f.req("trip", "PUT", {
    ...plan.body.trip,
    stops: [{ id: stops[0].id, day: 1, minutes: 60, kind: "food" }],
  });
  assert.equal(bad.status, 400, "不能伪造kind绕过博物馆时长");
  const stale = await f.req("places", "POST", {
    places: [{ ...place, id: "new-food" }],
    tripId: a.id,
    revision: a.revision,
  });
  assert.equal(stale.status, 409);
  assert.ok(
    !(await f.req("bootstrap")).body.venues.some((v) => v.id === "new-food"),
  );
});

test("路书冻结版本、重复保存幂等、分享不带路径备注、跨旅行下载与恢复", async (t) => {
  const f = await fixture(t),
    a = await configured(f);
  let current = (
    await f.req("selection", "PUT", {
      tripId: a.id,
      inputRevision: a.revision,
      ids: [stops[0].id],
    })
  ).body.trip;
  const draft = await f.req("roadbooks", "POST", {
    tripId: a.id,
    revision: current.revision,
  });
  assert.equal(draft.status, 201, JSON.stringify(draft.body));
  assert.equal(draft.body.roadbook.snapshot.status, "draft");
  const same = await f.req("roadbooks", "POST", {
    tripId: a.id,
    revision: current.revision,
  });
  assert.equal(same.body.roadbook.id, draft.body.roadbook.id);
  current = (await f.req("trip", "PUT", { ...current, stops })).body.trip;
  const planned = await f.req("roadbooks", "POST", {
    tripId: a.id,
    revision: current.revision,
  });
  assert.equal(planned.body.roadbook.version, 2);
  assert.equal(planned.body.roadbook.snapshot.status, "planned");
  await f.req("favorites", "PUT", {
    id: stops[0].id,
    note: "private-note",
    visited: true,
  });
  const changed = await f.req("trip", "PUT", {
    ...current,
    title: "新草稿标题",
    stops: [{ ...stops[0], day: 3 }],
  });
  const archive = planned.body.roadbook;
  for (const format of ["html", "md", "json", "csv"]) {
    const exported = await f.req("export", "POST", {
      roadbookId: archive.id,
      format,
      share: true,
    });
    assert.equal(exported.status, 201, JSON.stringify(exported.body));
    const body = await (await fetch(f.base + exported.body.downloadUrl)).text();
    assert.ok(body.includes("周末寻馆") || format === "csv");
    assert.ok(!body.includes("新草稿标题"));
    assert.ok(!body.includes(f.dir));
    assert.ok(!body.includes("private-note"));
  }
  const all = (await f.req("roadbooks")).body.roadbooks;
  assert.equal(all.length, 2);
  assert.equal(all[0].snapshot.title, "周末寻馆");
  const restored = await f.req("roadbooks", "PUT", {
    id: archive.id,
    revision: changed.body.trip.revision,
  });
  assert.equal(restored.status, 200, JSON.stringify(restored.body));
  assert.deepEqual(restored.body.trip.stops, stops);
  assert.equal(
    (
      await f.req("roadbooks", "PUT", {
        id: archive.id,
        revision: current.revision,
      })
    ).status,
    409,
  );
});

test("标签推荐3–5个真实返回候选；缺评分留空、缓存不写收藏且取消无事实", async (t) => {
  let calls = 0;
  const f = await fixture(t, {
    amap: async (action, params) => {
      calls++;
      assert.equal(action, "around");
      assert.equal(params.kind, "food");
      assert.equal(params.radius, 3000);
      return {
        pois: Array.from({ length: 7 }, (_, i) => ({
          id: "POI00" + i,
          name: "测试小吃" + i,
          location: "120.62,31.32",
          cityname: "苏州市",
          address: "测试街道",
          biz_ext: i === 0 ? { rating: "4.5", cost: "25" } : { rating: [] },
        })),
      };
    },
  });
  await configured(f);
  const query = {
    tag: "特色小吃",
    city: "苏州",
    center: { longitude: 120.62, latitude: 31.32, crs: "GCJ-02" },
  };
  const r = await f.req("recommendations", "POST", query);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.places.length, 5);
  assert.equal(r.body.places[0].rating.provider, "amap");
  assert.equal(r.body.places[1].rating, null);
  assert.equal((await f.req("bootstrap")).body.favorites.length, 0);
  assert.equal((await f.req("bootstrap")).body.venues.length, 5);
  const cached = await f.req("recommendations", "POST", query);
  assert.equal(cached.body.cached, true);
  assert.equal(calls, 1);
  await f.req("recommendations", "POST", { ...query, refresh: true });
  assert.equal(calls, 2);
  assert.equal(
    (await f.req("recommendations", "POST", { ...query, tag: "伪造榜单" }))
      .status,
    400,
  );
});

test("HTML定制准备只写所选档案公开上下文，不串旅行也不改变revision", async (t) => {
  const f = await fixture(t),
    a = await configured(f);
  const selected = (
    await f.req("selection", "PUT", {
      tripId: a.id,
      inputRevision: a.revision,
      ids: [stops[0].id],
    })
  ).body.trip;
  const r = await f.req("roadbooks", "POST", {
    tripId: a.id,
    revision: selected.revision,
  });
  const prepared = await f.req("agent-context", "POST", {
    tripId: a.id,
    revision: selected.revision,
    roadbookId: r.body.roadbook.id,
  });
  assert.equal(prepared.status, 200, JSON.stringify(prepared.body));
  const snapshot = JSON.parse(
    await readFile(
      join(a.settings.folder, "input/selected-roadbook.json"),
      "utf8",
    ),
  );
  assert.equal(snapshot.version, 1);
  assert.equal(snapshot.snapshot.selections[0].id, stops[0].id);
  assert.match(
    await readFile(join(a.settings.folder, "input/HTML-ROADBOOK.md"), "utf8"),
    /前1天/,
  );
  assert.equal(
    (await f.req("trip?id=" + a.id)).body.trip.revision,
    selected.revision,
  );
  assert.equal(
    (
      await f.req("agent-context", "POST", {
        tripId: a.id,
        revision: 1,
        roadbookId: r.body.roadbook.id,
      })
    ).status,
    409,
  );
  const other = (
    await f.req("trips", "POST", {
      title: "另一旅行",
      folder: f.dir,
      settings: { destination: "苏州" },
    })
  ).body.trip;
  assert.equal(
    (
      await f.req("agent-context", "POST", {
        tripId: other.id,
        revision: other.revision,
        roadbookId: r.body.roadbook.id,
      })
    ).status,
    404,
  );
});

test("核实信息生成同路线新版本并回顾；旧版本与草稿revision不被覆盖", async (t) => {
  const f = await fixture(t, {
    amap: async (action) =>
      action === "detail2"
        ? {
            pois: [
              {
                id: "B020001285",
                business: { opentime_week: "合成测试：周二至周日9-17" },
              },
            ],
          }
        : action === "geo"
          ? { geocodes: [{ adcode: "320500" }] }
          : {
              forecasts: [
                {
                  city: "苏州",
                  reporttime: "2026-10-16 11:00:00",
                  casts: [
                    {
                      date: "2026-10-24",
                      dayweather: "雷阵雨",
                      nightweather: "小雨",
                      nighttemp: "18",
                      daytemp: "24",
                    },
                  ],
                },
              ],
            },
  });
  const a = await configured(f),
    selected = (
      await f.req("selection", "PUT", {
        tripId: a.id,
        inputRevision: a.revision,
        ids: [stops[0].id],
      })
    ).body.trip;
  const book = (
    await f.req("roadbooks", "POST", {
      tripId: a.id,
      revision: selected.revision,
    })
  ).body.roadbook;
  const checked = await f.req("roadbook-check", "POST", {
    roadbookId: book.id,
  });
  assert.equal(checked.status, 201, JSON.stringify(checked.body));
  assert.equal(checked.body.check.report.checks[0].closureVerified, false);
  const applied = await f.req("check-apply", "POST", {
    id: checked.body.check.id,
  });
  assert.equal(applied.status, 201, JSON.stringify(applied.body));
  assert.equal(applied.body.roadbook.version, 2);
  assert.equal(applied.body.roadbook.input_revision, book.input_revision);
  assert.notEqual(applied.body.roadbook.id, book.id);
  assert.equal(
    (await f.req("trip?id=" + a.id)).body.trip.revision,
    selected.revision,
  );
  assert.ok(
    !applied.body.roadbooks.find((x) => x.id === book.id).snapshot.preflight,
  );
  const repeated = await f.req("check-apply", "POST", {
    id: checked.body.check.id,
  });
  assert.equal(repeated.body.roadbook.id, applied.body.roadbook.id);
  const out = await f.req("export", "POST", {
    roadbookId: applied.body.roadbook.id,
    format: "html",
    share: true,
  });
  assert.equal(out.status, 201);
  const html = await (await fetch(f.base + out.body.downloadUrl)).text();
  assert.match(html, /天候与行装/);
  assert.match(html, /行程前后各留一天/);
  assert.match(html, /未到预报期/);
  assert.ok(!html.includes(f.dir));
  assert.match(html, /<svg/);
  const files = await f.req("bootstrap");
  assert.equal(files.body.checks.length, 1);
  assert.equal(
    files.body.venues.find((v) => v.id === stops[0].id).openingHoursSource,
    "amap",
  );
});

test("路书存档/删除/恢复持久化，冻结内容与设计revision不变", async(t)=>{
 const f=await fixture(t), original=await configured(f);
 const trip=(await f.req("selection","PUT",{tripId:original.id,inputRevision:original.revision,ids:[stops[0].id]})).body.trip;
 const book=(await f.req("roadbooks","POST",{tripId:trip.id,revision:trip.revision})).body.roadbook;
 for(const [action,state] of [["archive","archived"],["delete","deleted"],["restore","active"]]){
  const r=await f.req("roadbooks","PUT",{id:book.id,action});
  assert.equal(r.status,200,JSON.stringify(r.body));
  const b=r.body.roadbooks.find(x=>x.id===book.id);
  assert.equal(b.recordState,state);assert.deepEqual(b.snapshot,book.snapshot);
  assert.equal((await f.req("trip?id="+trip.id)).body.trip.revision,trip.revision);
 }
 assert.equal((await f.req("roadbooks","PUT",{id:book.id,action:"erase"})).status,400);
});
test("四君子生成PNG的宿主资源入口返回真实PNG和正确MIME",async(t)=>{
 const f=await fixture(t);
 for(const name of ["orchid-spring","bamboo-summer","chrysanthemum-autumn","plum-winter"]){
  const r=await fetch(f.base+"/workbench/find-museum/assets/song/paintings/"+name+".png");
  assert.equal(r.status,200);assert.match(r.headers.get("content-type"),/image\/png/);
  const bytes=Buffer.from(await r.arrayBuffer());assert.equal(bytes.subarray(1,4).toString(),"PNG");
 }
});
