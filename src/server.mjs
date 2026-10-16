import {
  readFile,
  writeFile,
  mkdir,
  realpath,
  stat,
  rename,
  lstat,
} from "node:fs/promises";
import { join, resolve, dirname, extname, isAbsolute } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  roadbookText,
  roadbookHtml,
  publicSnapshot,
} from "./domain/roadbook.mjs";
import { Catalog } from "./data/catalog.mjs";
import { serveMap, amapConfigured, saveAmapKey, amapQuery } from "./maps.mjs";
import { TripStore, RevisionConflict } from "./data/trip-store.mjs";
import {
  coordinate,
  validateStops,
  csvText,
  distanceKm,
} from "./domain/route.mjs";
const pkg = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url)),
  ),
  ROOT = fileURLToPath(new URL("../", import.meta.url)),
  PREFIX = "/api/find-museum";
const assets = {
  "/workbench/find-museum/": "public/index.html",
  "/workbench/find-museum/app.js": "public/app.js",
  "/workbench/find-museum/app.css": "public/app.css",
  "/workbench/find-museum/map.mjs": "public/map.mjs",
  "/workbench/find-museum/roadbook.mjs": "public/roadbook.mjs",
  "/workbench/find-museum/route.mjs": "public/route.mjs",
  "/workbench/find-museum/vendor/leaflet.js": "public/vendor/leaflet.js",
  "/workbench/find-museum/vendor/leaflet.css": "public/vendor/leaflet.css",
};
export const routes = [
  ...Object.keys(assets),
  ...[
    "map",
    "amap",
    "driving",
    "health",
    "bootstrap",
    "configure",
    "catalog",
    "museum",
    "trips",
    "trip",
    "favorites",
    "export",
    "file",
    "candidates",
    "review",
    "artifacts",
    "session-projects",
    "settings",
    "places",
    "recommendations",
    "roadbooks",
    "plan-import",
    "selection",
    "selection-import",
  ].map((s) => PREFIX + "/" + s),
];
const json = (res, status, body) => {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(JSON.stringify(body));
};
function fail(message, status = 400, code = "INVALID_INPUT") {
  const e = new Error(message);
  e.status = status;
  e.code = code;
  throw e;
}
const text = (v, max = 500) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";
async function payload(req) {
  if (!String(req.headers["content-type"] || "").startsWith("application/json"))
    fail("写入需要JSON", 415);
  let body = "",
    size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 256000) fail("请求过大", 413);
    body += chunk;
  }
  try {
    return JSON.parse(body || "{}");
  } catch {
    fail("JSON格式错误");
  }
}
async function safeOutput(folder, name = "output") {
  const dir = join(folder, name);
  await mkdir(dir, { recursive: true });
  if (
    (await lstat(dir)).isSymbolicLink() ||
    !(await realpath(dir)).startsWith(folder + "/")
  )
    fail("输出目录不能链接到旅行目录外", 403);
  return dir;
}
async function atomic(path, value) {
  const temp = path + "." + randomUUID() + ".tmp";
  await writeFile(temp, value, { mode: 0o600 });
  await rename(temp, path);
}
const allowedUrl = (v) => {
  if (!v) return "";
  try {
    const u = new URL(v);
    if (["http:", "https:"].includes(u.protocol) && !u.username && !u.password)
      return u.href;
  } catch {}
  fail("来源链接必须是HTTP(S)");
};
const settings = (s = {}) => ({
  destination: text(s.destination, 80),
  date: /^\d{4}-\d{2}-\d{2}$/.test(s.date || "") ? s.date : "",
  mode: ["尚未决定", "自驾", "公共交通", "步行"].includes(s.mode)
    ? s.mode
    : "尚未决定",
  center: s.center ? coordinate(s.center) : null,
  notes: text(s.notes, 10000),
});
function validateVenue(v) {
  if (!v || typeof v !== "object") fail("馆址对象无效");
  const kind = v.kind || "museum";
  if (!["museum", "food", "attraction", "citywalk"].includes(kind))
    fail("地点类别无效");
  if (!v.unlocated) coordinate(v);
  if (!v.unlocated && v.crs !== "GCJ-02")
    fail("当前地图仅接受GCJ-02馆址；请先使用高德核实坐标");
  if (
    !["unknown", "open", "closed", "partial", "seasonal"].includes(
      v.openingStatus,
    )
  )
    fail("开放状态需为unknown/open/closed/partial/seasonal");
  if (
    !text(v.name, 160) ||
    (!v.unlocated && !text(v.address, 400)) ||
    (!v.sourceUrl && !(v.unlocated && v.provider === "manual"))
  )
    fail("名称、地址和来源必填");
  const id = text(v.id, 100) || "research-" + randomUUID();
  if (!/^[a-zA-Z0-9._-]+$/.test(id)) fail("馆址ID格式错误");
  const result = {
    id,
    kind,
    unlocated: !!v.unlocated,
    provider: text(v.provider, 40),
    providerPoiId: text(v.providerPoiId, 100),
    rating:
      v.rating &&
      v.rating.provider === "amap" &&
      Number.isFinite(v.rating.value) &&
      v.rating.value >= 0 &&
      v.rating.value <= 100
        ? {
            provider: "amap",
            value: v.rating.value,
            scale: null,
            checkedAt: text(v.rating.checkedAt, 40),
          }
        : null,
    cost: text(v.cost, 40),
    name: text(v.name, 160),
    museumId: text(v.museumId, 100) || id,
    city: text(v.city, 80),
    province: text(v.province, 80),
    district: text(v.district, 80),
    address: text(v.address, 400),
    longitude: v.longitude,
    latitude: v.latitude,
    crs: v.crs,
    geocodeStatus: "user-reviewed-source",
    county: !!v.county,
    label: v.county ? "县域发现" : "已核实馆址",
    themes: Array.isArray(v.themes)
      ? v.themes.slice(0, 10).map((x) => text(x, 40))
      : [],
    intro: text(v.intro, 1000),
    featuredExhibits: text(v.featuredExhibits, 1000),
    officialUrl: allowedUrl(v.officialUrl),
    reservationUrl: allowedUrl(v.reservationUrl),
    exhibitSource: allowedUrl(v.exhibitSource),
    introSource: allowedUrl(v.introSource),
    wechatName: text(v.wechatName, 100),
    wechatUrl: allowedUrl(v.wechatUrl),
    wechatIntro: text(v.wechatIntro, 1000),
    sourceUrl: allowedUrl(v.sourceUrl),
    grade: text(v.grade, 20),
    gradeAsOf: text(v.gradeAsOf, 20),
    openingHours: text(v.openingHours, 2000),
    openingStatus: v.openingStatus,
    checkedAt: text(v.checkedAt, 40),
    publishedAt: text(v.publishedAt, 40),
    validFrom: text(v.validFrom, 40),
    validTo: text(v.validTo, 40),
    statusNote: text(v.statusNote, 500),
  };
  if (
    result.openingStatus !== "unknown" &&
    (!result.checkedAt || !result.validFrom || !result.validTo)
  )
    fail("开放结论需要核实时间和生效起止日期；不明确请用unknown");
  for (const field of ["validFrom", "validTo"])
    if (
      result[field] &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(result[field]) ||
        Number.isNaN(Date.parse(result[field])) ||
        new Date(result[field]).toISOString().slice(0, 10) !== result[field])
    )
      fail("公告有效日期必须为YYYY-MM-DD");
  if (result.validFrom && result.validTo && result.validFrom > result.validTo)
    fail("公告结束日期不能早于开始日期");
  return result;
}
export function createService({ amap = amapQuery } = {}) {
  const catalog = new Catalog();
  let store = null,
    dataRoot = "",
    sessionBindings = {};
  let configurationQueue = Promise.resolve();
  const requireStore = () => {
    if (!store)
      fail("请先通过系统目录选择器选择本地资料目录", 428, "DATA_ROOT_REQUIRED");
    return store;
  };
  const trip = (id) => {
    const t = requireStore().get(text(id, 100));
    if (!t || t.archived) fail("旅行项目不存在或已归档", 404);
    return t;
  };
  const venues = () => catalog.venues(store?.overrides() || []);
  async function tripFolder(t) {
    const path = t.settings.folder;
    if (path && (await lstat(path)).isSymbolicLink())
      fail("旅行目录不能是替换后的符号链接", 403);
    if (!path || !isAbsolute(path)) fail("旅行目录尚未确认", 428);
    try {
      const s = await stat(path);
      if (!s.isDirectory()) throw Error();
    } catch {
      fail(
        "原旅行目录不存在，请重新选择，系统不会重建旧目录",
        409,
        "TRIP_FOLDER_MISSING",
      );
    }
    return realpath(path);
  }
  async function writeContext(t) {
    const folder = await tripFolder(t);
    await safeOutput(folder, "input");
    await atomic(
      join(folder, "input", "museum-route-planner.md"),
      await readFile(
        join(ROOT, "skills/museum-route-planner/SKILL.md"),
        "utf8",
      ),
    );
    await atomic(
      join(folder, "input", "OUTPUT-CONTRACT.md"),
      await readFile(
        join(ROOT, "skills/museum-route-planner/references/OUTPUT-CONTRACT.md"),
        "utf8",
      ),
    );
    await atomic(
      join(folder, "input", "selected-museums.json"),
      JSON.stringify(
        {
          schemaVersion: 1,
          tripId: t.id,
          inputRevision: t.revision,
          venues: t.selections.map((id) => venues().find((v) => v.id === id)),
          stops: t.stops,
        },
        null,
        2,
      ),
    );
    await atomic(join(folder, "route.json"), JSON.stringify(t, null, 2));
    await atomic(
      join(folder, "CONTEXT.md"),
      `# 寻馆旅行项目\n\n项目ID：${t.id}\n名称：${t.title}\nrevision：${t.revision}\n\nroute.json是工作台导出的只读快照。请通过工作台导入字段候选；直接改此快照不会更新SQLite。来源与待核实项必须保留，不把历史名录当当前开放状态。\n\n任务指南在input/museum-route-planner.md，交换结构在input/OUTPUT-CONTRACT.md，馆址快照在input/selected-museums.json；它们是生成文件。路书输出放output/，使用输入revision关联；用户确认后登记回工作台。\n`,
    );
  }
  async function configure(path) {
    if (typeof path !== "string" || !isAbsolute(path)) fail("请选择现有目录");
    const canonical = await realpath(path);
    if (!(await stat(canonical)).isDirectory()) fail("请选择目录");
    const db = new TripStore(canonical);
    db.prepareBusinessTables();
    let bindings = {};
    try {
      bindings = JSON.parse(
        await readFile(
          join(canonical, ".desktop-session-projects.json"),
          "utf8",
        ),
      );
      if (!bindings || Array.isArray(bindings) || typeof bindings !== "object")
        bindings = {};
    } catch (e) {
      if (e.code !== "ENOENT") {
        db.close();
        fail("会话映射损坏，请保留文件并先修复", 409);
      }
    }
    store?.close();
    store = db;
    dataRoot = canonical;
    sessionBindings = bindings;
    return { dataRoot };
  }
  async function handle(req, res) {
    try {
      const url = new URL(req.url, "http://127.0.0.1"),
        path = url.pathname;
      if (req.method !== "GET") {
        const origin = req.headers.origin;
        if (!origin || new URL(origin).host !== req.headers.host)
          return json(res, 403, {
            error: "写入仅接受同源请求",
            code: "ORIGIN_REQUIRED",
          });
      }
      if (path === PREFIX + "/map" && req.method === "GET")
        return serveMap(req, res);
      if (assets[path]) {
        if (req.method !== "GET")
          return json(res, 405, { error: "Method not allowed" });
        const file = join(ROOT, assets[path]),
          body = await readFile(file),
          type = {
            ".html": "text/html; charset=utf-8",
            ".js": "text/javascript; charset=utf-8",
            ".mjs": "text/javascript; charset=utf-8",
            ".css": "text/css; charset=utf-8",
          }[extname(file)];
        res.writeHead(200, {
          "content-type": type,
          "x-content-type-options": "nosniff",
          "cache-control": "no-cache",
          "content-security-policy":
            "frame-ancestors 'self'; object-src 'none'; base-uri 'self'",
        });
        res.end(body);
        return;
      }
      if (path === PREFIX + "/settings" && req.method === "POST") {
        const p = await payload(req);
        await saveAmapKey(p.amapWebServiceKey);
        return json(res, 200, { amapConfigured: true });
      }
      if (path === PREFIX + "/amap" && req.method === "POST") {
        const p = await payload(req);
        if (!["geo", "search", "detail"].includes(p.action))
          fail("不支持的地图操作");
        return json(res, 200, await amap(p.action, p.params));
      }
      if (path === PREFIX + "/driving" && req.method === "POST") {
        const p = await payload(req),
          t = trip(p.tripId);
        if (p.revision !== t.revision) throw new RevisionConflict();
        const all = new Map(venues().map((v) => [v.id, v]));
        const legs = [];
        for (let i = 1; i < t.stops.length; i++) {
          const a = all.get(t.stops[i - 1].id),
            b = all.get(t.stops[i].id);
          if (t.stops[i - 1].day !== t.stops[i].day) continue;
          if (a.crs !== "GCJ-02" || b.crs !== "GCJ-02")
            fail("驾车核算需要高德GCJ-02坐标");
          const result = await amap("driving", {
            origin: `${a.longitude},${a.latitude}`,
            destination: `${b.longitude},${b.latitude}`,
          });
          const route = result.route?.paths?.[0];
          if (!route) fail("该路段没有驾车结果", 502);
          legs.push({
            from: a.id,
            to: b.id,
            day: t.stops[i].day,
            distanceMeters: Number(route.distance),
            durationSeconds: Number(route.duration),
            source: "amap-web-service",
            queriedAt: new Date().toISOString(),
          });
        }
        return json(res, 200, {
          legs,
          inputRevision: t.revision,
          note: "查询时估算，不保证未来日期交通；跨日路段未计入",
        });
      }
      if (path === PREFIX + "/health" && req.method === "GET")
        return json(res, 200, {
          ok: true,
          version: pkg.version,
          configured: !!store,
          dataRoot,
          capabilities: [
            "catalog",
            "sqlite",
            "trip",
            "favorites",
            "export",
            "review",
          ],
        });
      if (path === PREFIX + "/configure" && req.method === "POST") {
        const p = await payload(req);
        const op = configurationQueue.then(() => configure(p.dataRoot));
        configurationQueue = op.catch(() => {});
        return json(res, 200, await op);
      }
      if (path === PREFIX + "/bootstrap" && req.method === "GET")
        return json(res, 200, {
          version: pkg.version,
          dataRoot,
          configured: !!store,
          manifest: catalog.manifest,
          venues: venues(),
          trips: store?.list() || [],
          favorites: store?.favorites() || [],
          bindings: sessionBindings,
          artifacts: store?.artifacts() || [],
          roadbooks: store?.roadbooks() || [],
          candidates: store?.candidates() || [],
          settings: {
            mapProvider: "amap-static",
            amapConfigured: await amapConfigured(),
            agentTools: "由原生会话提供；运行时可用性由宿主决定",
          },
        });
      if (path === PREFIX + "/catalog" && req.method === "GET") {
        const page = Math.max(
          1,
          Math.min(10000, parseInt(url.searchParams.get("page")) || 1),
        );
        return json(
          res,
          200,
          catalog.search({
            q: text(url.searchParams.get("q"), 200),
            city: text(url.searchParams.get("city"), 80),
            province: text(url.searchParams.get("province"), 80),
            grade: text(url.searchParams.get("grade"), 20),
            county: url.searchParams.get("county") === "true",
            page,
            pageSize: 40,
          }),
        );
      }
      if (path === PREFIX + "/museum" && req.method === "GET") {
        const m = catalog.detail(url.searchParams.get("id"));
        return m
          ? json(res, 200, m)
          : json(res, 404, { error: "名录记录不存在" });
      }
      if (path === PREFIX + "/recommendations" && req.method === "POST") {
        const p = await payload(req);
        const tags = {
          特色小吃: ["food", "小吃"],
          本地餐馆: ["food", "本地菜"],
          老字号: ["food", "老字号"],
          周边景点: ["attraction", "景点"],
          Citywalk: ["citywalk", "历史街区"],
        };
        if (!tags[p.tag]) fail("推荐标签无效");
        const [kind, keywords] = tags[p.tag],
          city = text(p.city, 80);
        if (!city) fail("请先在发现页选择目的地城市");
        let point = p.center ? coordinate(p.center) : null;
        if (point?.crs !== "GCJ-02") point = null;
        const radius = kind === "food" && p.tag === "本地餐馆" ? 5000 : 3000;
        const cacheKey = JSON.stringify([
          city,
          p.tag,
          point?.longitude,
          point?.latitude,
          radius,
        ]);
        const cached = store?.db
          .prepare("SELECT * FROM recommendation_cache WHERE cache_key=?")
          .get(cacheKey);
        if (
          cached &&
          Date.now() - Date.parse(cached.created_at) < 1800000 &&
          !p.refresh
        )
          return json(res, 200, {
            ...JSON.parse(cached.payload),
            cached: true,
          });
        const r = await amap(point ? "around" : "search", {
          kind,
          keywords,
          city,
          location: point ? `${point.longitude},${point.latitude}` : undefined,
          radius,
        });
        const checkedAt = new Date().toISOString();
        const places = (r.pois || [])
          .filter(
            (v) =>
              v.location &&
              !(kind === "citywalk" && v.typecode?.startsWith("1401")) &&
              typeof v.name === "string" &&
              !/停车|入口|出口|办公室/.test(v.name),
          )
          .slice(0, 5)
          .map((v) => {
            const [longitude, latitude] = v.location.split(",").map(Number);
            const ratingValue = Number(v.biz_ext?.rating),
              rating =
                typeof v.biz_ext?.rating === "string" &&
                v.biz_ext.rating.trim() &&
                Number.isFinite(ratingValue) &&
                ratingValue > 0 &&
                ratingValue <= 100
                  ? {
                      provider: "amap",
                      value: ratingValue,
                      scale: null,
                      checkedAt,
                    }
                  : null;
            return validateVenue({
              id: "amap-" + v.id,
              provider: "amap",
              providerPoiId: v.id,
              kind,
              name: v.name,
              city: v.cityname || city,
              province: v.pname,
              district: v.adname,
              address: [
                v.pname,
                v.cityname,
                v.adname,
                typeof v.address === "string" ? v.address : "",
              ]
                .filter(Boolean)
                .join(""),
              longitude,
              latitude,
              crs: "GCJ-02",
              openingStatus: "unknown",
              openingHours:
                typeof v.business?.opentime_today === "string"
                  ? v.business.opentime_today
                  : "",
              checkedAt,
              sourceUrl:
                "https://uri.amap.com/marker?position=" +
                v.location +
                "&name=" +
                encodeURIComponent(v.name),
              rating,
              cost: typeof v.biz_ext?.cost === "string" ? v.biz_ext.cost : "",
              themes: [p.tag],
              intro: typeof v.tag === "string" ? v.tag : "",
            });
          });
        const result = {
          places,
          city,
          tag: p.tag,
          radius: point ? radius : null,
          center: point,
          checkedAt,
          source: "amap",
          note: point
            ? "按中心周边检索；评分与营业信息以实际返回为准"
            : "按目的地城市检索；尚无周边距离约束",
        };
        if (store)
          store.db
            .prepare(
              "INSERT INTO recommendation_cache VALUES(?,?,?) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,created_at=excluded.created_at",
            )
            .run(cacheKey, JSON.stringify(result), checkedAt);
        return json(res, 200, result);
      }
      if (path === PREFIX + "/places" && req.method === "POST") {
        requireStore();
        const p = await payload(req);
        if (
          !Array.isArray(p.places) ||
          !p.places.length ||
          p.places.length > 30
        )
          fail("请选择1到30个地点");
        const current = new Map(venues().map((v) => [v.id, v]));
        const places = p.places.map((v) =>
          validateVenue({
            ...current.get(v.id),
            ...v,
            ...(current.has(v.id)
              ? { kind: current.get(v.id).kind || "museum" }
              : {}),
          }),
        );
        if (new Set(places.map((v) => v.id)).size !== places.length)
          fail("地点重复");
        const oldFavorites = new Set(store.favorites().map((f) => f.id));
        let target;
        if (p.tripId) {
          target = trip(p.tripId);
          if (target.revision !== p.revision) throw new RevisionConflict();
        }
        store.db.exec("BEGIN IMMEDIATE");
        try {
          store.savePlaces(places);
          for (const v of places)
            if (!store.favorites().some((f) => f.id === v.id))
              store.putFavorite(v.id, { note: "", visited: false });
          if (target)
            store.saveSelection(
              target,
              [...new Set([...target.selections, ...places.map((v) => v.id)])],
              { transaction: false },
            );
          store.db.exec("COMMIT");
        } catch (e) {
          store.db.exec("ROLLBACK");
          throw e;
        }
        return json(res, 201, {
          venues: venues(),
          favorites: store.favorites(),
          trip: target ? store.get(target.id) : null,
          createdCount: places.filter((v) => !oldFavorites.has(v.id)).length,
          existingCount: places.filter((v) => oldFavorites.has(v.id)).length,
        });
      }
      if (path === PREFIX + "/roadbooks" && req.method === "GET")
        return json(res, 200, { roadbooks: requireStore().roadbooks() });
      if (path === PREFIX + "/roadbooks" && req.method === "PUT") {
        const p = await payload(req),
          a = requireStore()
            .roadbooks()
            .find((a) => a.id === p.id);
        if (!a) fail("档案不存在", 404);
        const t = trip(a.trip_id);
        if (t.revision !== p.revision) throw new RevisionConflict();
        const old = a.snapshot,
          all = new Map(venues().map((v) => [v.id, v]));
        if ([...old.selections, ...old.stops].some((v) => !all.has(v.id)))
          fail("部分地点资料缺失，请先恢复地点");
        store.db.exec("BEGIN IMMEDIATE");
        let saved;
        try {
          const next = store.saveSelection(
            t,
            [...new Set([...old.selections, ...old.stops].map((v) => v.id))],
            { transaction: false },
          );
          saved = store.save(
            t.id,
            {
              title: old.title,
              settings: {
                ...t.settings,
                destination: old.destination,
                date: old.date,
                mode: old.mode,
              },
              stops: old.stops.map((v) => ({
                id: v.id,
                day: v.day,
                minutes: v.minutes,
                kind: all.get(v.id).kind || "museum",
              })),
            },
            next.revision,
            { transaction: false },
          );
          store.db.exec("COMMIT");
        } catch (e) {
          store.db.exec("ROLLBACK");
          throw e;
        }
        let warning = "";
        try {
          await writeContext(saved);
        } catch (e) {
          warning = "草稿已保存，快照尚未更新：" + e.message;
        }
        return json(res, 200, { trip: saved, warning });
      }
      if (path === PREFIX + "/roadbooks" && req.method === "POST") {
        const p = await payload(req),
          t = trip(p.tripId);
        if (t.revision !== p.revision) throw new RevisionConflict();
        if (!t.selections.length && !t.stops.length) fail("请先添加地点");
        const r = store.saveRoadbook(t, venues());
        let warning = "";
        if (
          !store
            .artifacts()
            .some(
              (a) =>
                a.payload.roadbookId === r.id && a.kind === "roadbook-snapshot",
            )
        ) {
          try {
            const folder = await tripFolder(t);
            await safeOutput(folder);
            const rel = "output/roadbook-" + r.id + ".json",
              content = JSON.stringify(r.snapshot, null, 2);
            await atomic(join(folder, rel), content);
            store.addArtifact(t.id, "roadbook-snapshot", rel, {
              title: t.title,
              format: "json",
              roadbookId: r.id,
              revision: t.revision,
              sha256: createHash("sha256").update(content).digest("hex"),
            });
          } catch (e) {
            warning = "路书已存入SQLite；输出快照尚未保存：" + e.message;
          }
        }
        return json(res, 201, {
          roadbook: r,
          roadbooks: store.roadbooks(),
          artifacts: store.artifacts(),
          warning,
        });
      }
      if (path === PREFIX + "/trips" && req.method === "GET")
        return json(res, 200, { trips: store?.list() || [] });
      if (path === PREFIX + "/trips" && req.method === "POST") {
        const p = await payload(req);
        requireStore().validate(p.title, p.settings || {});
        if (typeof p.folder !== "string" || !isAbsolute(p.folder))
          fail("新建旅行需要系统选择的目录");
        const parent = await realpath(p.folder);
        if (!(await stat(parent)).isDirectory()) fail("旅行上级不是目录");
        const input = settings(p.settings),
          t = store.create(p.title, input),
          folder = join(parent, "寻馆-" + t.id.slice(0, 8));
        try {
          await mkdir(folder);
          await mkdir(join(folder, "output"));
          const saved = store.save(
            t.id,
            { title: t.title, settings: { ...input, folder }, stops: [] },
            t.revision,
          );
          await writeContext(saved);
          return json(res, 201, { trip: saved, folder });
        } catch (e) {
          store.archive(t.id, store.get(t.id).revision);
          throw e;
        }
      }
      if (path === PREFIX + "/trip" && req.method === "GET")
        return json(res, 200, { trip: trip(url.searchParams.get("id")) });
      if (path === PREFIX + "/trip" && req.method === "PUT") {
        const p = await payload(req),
          old = trip(p.id);
        const kinds = new Map(venues().map((v) => [v.id, v.kind || "museum"]));
        p.stops = p.stops.map((s) => ({
          ...s,
          kind: kinds.get(s.id) || "museum",
        }));
        validateStops(p.stops);
        const ids = new Set(venues().map((v) => v.id));
        if (p.stops.some((s) => !ids.has(s.id))) fail("路线包含尚未确认的馆址");
        p.stops = p.stops.map(({ kind, ...s }) =>
          kind === "museum" ? s : { ...s, kind },
        );
        const saved = store.save(
          p.id,
          {
            title: p.title,
            settings: { ...settings(p.settings), folder: old.settings.folder },
            stops: p.stops,
          },
          p.revision,
        );
        let warning = "";
        try {
          await writeContext(saved);
        } catch (e) {
          warning = "SQLite已保存，但工作区快照未更新：" + e.message;
        }
        return json(res, 200, { trip: saved, warning });
      }
      if (path === PREFIX + "/trip" && req.method === "DELETE") {
        const p = await payload(req);
        trip(p.id);
        return json(res, 200, { trip: store.archive(p.id, p.revision) });
      }
      if (path === PREFIX + "/favorites" && req.method === "GET")
        return json(res, 200, { favorites: requireStore().favorites() });
      if (path === PREFIX + "/favorites" && req.method === "PUT") {
        const p = await payload(req);
        requireStore();
        if (!venues().some((v) => v.id === p.id)) fail("馆址不存在");
        store.putFavorite(p.id, {
          note: text(p.note, 5000),
          visited: !!p.visited,
        });
        return json(res, 200, { favorites: store.favorites() });
      }
      if (path === PREFIX + "/favorites" && req.method === "DELETE") {
        const p = await payload(req);
        requireStore().deleteFavorite(text(p.id, 100));
        return json(res, 200, { favorites: store.favorites() });
      }
      if (path === PREFIX + "/session-projects" && req.method === "GET")
        return json(res, 200, { bindings: sessionBindings });
      if (path === PREFIX + "/session-projects" && req.method === "POST") {
        const p = await payload(req);
        requireStore();
        if (!/^[\w:.-]{1,180}$/.test(p.sessionId || "")) fail("会话ID无效");
        trip(p.project);
        const next = { ...sessionBindings, [p.sessionId]: p.project };
        await atomic(
          join(dataRoot, ".desktop-session-projects.json"),
          JSON.stringify(next, null, 2),
        );
        sessionBindings = next;
        return json(res, 200, { bindings: sessionBindings });
      }
      if (path === PREFIX + "/selection" && req.method === "PUT") {
        const p = await payload(req),
          t = trip(p.tripId);
        if (p.inputRevision !== t.revision) throw new RevisionConflict();
        const known = new Set(venues().map((v) => v.id));
        if (!Array.isArray(p.ids) || p.ids.some((id) => !known.has(id)))
          fail("清单包含未确认馆址");
        const saved = store.saveSelection(t, p.ids);
        let warning = "";
        try {
          await writeContext(saved);
        } catch (e) {
          warning = "清单已保存，快照尚未更新：" + e.message;
        }
        return json(res, 200, { trip: saved, warning });
      }
      if (path === PREFIX + "/selection-import" && req.method === "POST") {
        const p = await payload(req),
          t = trip(p.tripId);
        if (p.inputRevision !== t.revision) throw new RevisionConflict();
        if (
          !Array.isArray(p.venues) ||
          !p.venues.length ||
          p.venues.length > 30
        )
          fail("请选择1到30个馆址");
        const existing = new Map(venues().map((v) => [v.id, v]));
        const confirmed = p.venues.map((v) =>
          validateVenue({ ...existing.get(v?.id), ...v }),
        );
        if (new Set(confirmed.map((v) => v.id)).size !== confirmed.length)
          fail("馆址重复");
        const saved = store.importSelection(t, confirmed);
        let warning = "";
        try {
          await writeContext(saved);
        } catch (e) {
          warning = "清单已保存，快照尚未更新：" + e.message;
        }
        return json(res, 201, {
          trip: saved,
          venues: venues(),
          candidates: store.candidates(),
          warning,
        });
      }
      if (path === PREFIX + "/plan-import" && req.method === "POST") {
        const p = await payload(req),
          t = trip(p.tripId);
        if (p.inputRevision !== t.revision) throw new RevisionConflict();
        if (
          !Array.isArray(p.venues) ||
          !p.venues.length ||
          p.venues.length > 30
        )
          fail("请选择1到30个馆址");
        const existing = new Map(venues().map((v) => [v.id, v]));
        const confirmed = p.venues.map((v) =>
          validateVenue({ ...existing.get(v?.id), ...v }),
        );
        const ids = new Set(confirmed.map((v) => v.id));
        if (ids.size !== confirmed.length) fail("馆址重复");
        const placeKinds = new Map(
          [...existing.values(), ...confirmed].map((v) => [
            v.id,
            v.kind || "museum",
          ]),
        );
        p.stops = p.stops.map(({ kind, ...s }) =>
          placeKinds.get(s.id) === "museum"
            ? s
            : { ...s, kind: placeKinds.get(s.id) },
        );
        validateStops(p.stops);
        if (p.stops.some((s) => !ids.has(s.id) && !existing.has(s.id)))
          fail("路线包含未知馆址");
        if (confirmed.some((v) => !p.stops.some((s) => s.id === v.id)))
          fail("所选馆址必须出现在规划中");
        const saved = store.importPlan(t, confirmed, p.stops);
        let warning = "";
        try {
          await writeContext(saved);
        } catch (e) {
          warning = "SQLite已保存，工作区快照尚未更新：" + e.message;
        }
        return json(res, 201, {
          trip: saved,
          venues: venues(),
          candidates: store.candidates(),
          warning,
        });
      }
      if (path === PREFIX + "/candidates" && req.method === "POST") {
        const p = await payload(req);
        const t = trip(p.tripId);
        if (p.inputRevision !== t.revision) throw new RevisionConflict();
        if (
          !Array.isArray(p.venues) ||
          !p.venues.length ||
          p.venues.length > 30
        )
          fail("一次导入1到30个完整馆址候选");
        const currentVenues = new Map(venues().map((v) => [v.id, v]));
        const checked = p.venues.map((v) =>
          validateVenue({ ...currentVenues.get(v?.id), ...v }),
        );
        const seen = new Set();
        for (const v of checked) {
          if (seen.has(v.id)) fail("同批候选ID重复");
          seen.add(v.id);
        }
        store.db.exec("BEGIN");
        try {
          checked.forEach((v) =>
            store.addCandidate(t.id, { ...v, inputRevision: p.inputRevision }),
          );
          store.db.exec("COMMIT");
        } catch (e) {
          store.db.exec("ROLLBACK");
          throw e;
        }
        return json(res, 201, { candidates: store.candidates() });
      }
      if (path === PREFIX + "/review" && req.method === "POST") {
        const p = await payload(req);
        requireStore();
        const candidate = store.candidates().find((x) => x.id === p.id);
        if (!candidate) fail("候选不存在", 404);
        if (
          p.accept &&
          trip(candidate.trip_id).revision !== candidate.payload.inputRevision
        )
          throw new RevisionConflict();
        if (typeof p.accept !== "boolean") fail("请明确接受或拒绝");
        store.reviewCandidate(text(p.id, 100), p.accept);
        return json(res, 200, {
          candidates: store.candidates(),
          venues: venues(),
        });
      }
      if (path === PREFIX + "/artifacts" && req.method === "GET")
        return json(res, 200, { artifacts: requireStore().artifacts() });
      if (path === PREFIX + "/artifacts" && req.method === "PUT") {
        const p = await payload(req),
          a = requireStore()
            .artifacts()
            .find((a) => a.id === p.id && a.kind === "agent-roadbook");
        if (!a) fail("Agent路书不存在", 404);
        store.db
          .prepare("UPDATE artifact SET payload=? WHERE id=?")
          .run(JSON.stringify({ ...a.payload, status: "confirmed" }), a.id);
        return json(res, 200, { artifacts: store.artifacts() });
      }
      if (path === PREFIX + "/artifacts" && req.method === "POST") {
        const p = await payload(req),
          t = trip(p.tripId);
        if (p.inputRevision !== t.revision) throw new RevisionConflict();
        if (
          !["md", "html", "json", "txt"].includes(p.format) ||
          typeof p.content !== "string" ||
          p.content.length > 150000
        )
          fail("路书格式或内容无效");
        const folder = await tripFolder(t);
        await safeOutput(folder);
        const id = randomUUID(),
          rel = "output/" + id + "." + p.format;
        await atomic(join(folder, rel), p.content);
        const book = store.saveRoadbook(t, venues());
        store.addArtifact(t.id, "agent-roadbook", rel, {
          roadbookId: book.id,
          status: "pending",
          title: text(p.title, 160) || "Agent路书",
          format: p.format,
          revision: t.revision,
          sha256: createHash("sha256").update(p.content).digest("hex"),
        });
        return json(res, 201, {
          artifacts: store.artifacts(),
          roadbooks: store.roadbooks(),
        });
      }
      if (path === PREFIX + "/export" && req.method === "POST") {
        const p = await payload(req);
        const archive = p.roadbookId
          ? requireStore()
              .roadbooks()
              .find((r) => r.id === p.roadbookId)
          : null;
        if (p.roadbookId && !archive) fail("路书档案不存在", 404);
        const t = trip(archive?.trip_id || p.tripId);
        if (!archive && p.revision !== t.revision) throw new RevisionConflict();
        if (!["md", "csv", "json", "html"].includes(p.format))
          fail("不支持的导出格式");
        const vv = new Map(venues().map((v) => [v.id, v]));
        const snapshot = publicSnapshot(
          archive?.snapshot || {
            schemaVersion: 2,
            title: t.title,
            tripId: t.id,
            revision: t.revision,
            destination: t.settings.destination,
            date: t.settings.date,
            mode: t.settings.mode,
            selections: t.selections.map((id) => vv.get(id)).filter(Boolean),
            stops: t.stops.map((s) => ({ ...vv.get(s.id), ...s })),
          },
        );
        if (!snapshot.stops.length && !snapshot.selections?.length)
          fail("请先加入地点");
        const rows = snapshot.stops.length
          ? snapshot.stops
          : snapshot.selections;
        let content =
          p.format === "json"
            ? JSON.stringify(snapshot, null, 2)
            : p.format === "csv"
              ? csvText(rows)
              : p.format === "html"
                ? roadbookHtml(snapshot)
                : roadbookText(snapshot);
        const folder = await tripFolder(t);
        await safeOutput(folder);
        const rel = "output/" + randomUUID() + "." + p.format;
        await atomic(join(folder, rel), content);
        const hash = createHash("sha256").update(content).digest("hex"),
          id = store.addArtifact(t.id, "route-export", rel, {
            title: t.title,
            format: p.format,
            revision: snapshot.revision,
            roadbookId: archive?.id || null,
            share: !!p.share,
            sha256: hash,
          });
        return json(res, 201, {
          id,
          path: rel,
          sha256: hash,
          downloadUrl: PREFIX + "/file?id=" + encodeURIComponent(id),
          artifacts: store.artifacts(),
        });
      }
      if (path === PREFIX + "/file" && req.method === "GET") {
        const a = requireStore()
          .artifacts()
          .find((a) => a.id === url.searchParams.get("id"));
        if (!a) fail("结果文件不存在", 404);
        const t = store.get(a.trip_id);
        const folder = await tripFolder(t),
          target = resolve(folder, a.path),
          real = await realpath(target);
        if (
          !real.startsWith(folder + "/") ||
          (await lstat(target)).isSymbolicLink()
        )
          fail("文件路径超出旅行目录", 403);
        const body = await readFile(real);
        const type =
          {
            md: "text/markdown",
            csv: "text/csv",
            json: "application/json",
            html: "text/html",
            txt: "text/plain",
          }[a.payload.format] || "application/octet-stream";
        res.writeHead(200, {
          "content-type": type + "; charset=utf-8",
          "content-disposition": `attachment; filename="museum-route-${a.id}.${a.payload.format}"`,
          "x-content-type-options": "nosniff",
          "cache-control": "no-store",
          "content-security-policy":
            "sandbox; default-src 'none'; style-src 'unsafe-inline'",
        });
        res.end(body);
        return;
      }
      return json(res, 404, { error: "接口或操作不存在" });
    } catch (e) {
      const status =
        e instanceof RevisionConflict
          ? 409
          : e.status ||
            (e.code === "ENOENT" ? 404 : e instanceof TypeError ? 400 : 500);
      json(res, status, { error: e.message, code: e.code || "REQUEST_FAILED" });
    }
  }
  let queue = Promise.resolve();
  return {
    configure,
    handle(req, res) {
      if (req.url?.startsWith(PREFIX + "/map?")) return handle(req, res);
      const op = queue.then(() => handle(req, res));
      queue = op.catch(() => {});
      return op;
    },
    close() {
      store?.close();
      catalog.close();
    },
  };
}
