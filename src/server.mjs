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
    "catalog.csv",
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
  coordinate(v);
  if (v.crs !== "GCJ-02")
    fail("当前地图仅接受GCJ-02馆址；请先使用高德核实坐标");
  if (
    !["unknown", "open", "closed", "partial", "seasonal"].includes(
      v.openingStatus,
    )
  )
    fail("开放状态需为unknown/open/closed/partial/seasonal");
  if (!text(v.name, 160) || !text(v.address, 400) || !v.sourceUrl)
    fail("名称、地址和来源必填");
  const id = text(v.id, 100) || "research-" + randomUUID();
  if (!/^[a-zA-Z0-9._-]+$/.test(id)) fail("馆址ID格式错误");
  const result = {
    id,
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
export function createService() {
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
        return json(res, 200, await amapQuery(p.action, p.params));
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
          const result = await amapQuery("driving", {
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
          candidates: store?.candidates() || [],
          settings: {
            mapProvider: "amap-static",
            amapConfigured: await amapConfigured(),
            agentTools: "由原生会话提供；运行时可用性由宿主决定",
          },
        });
      if (path === PREFIX + "/catalog.csv" && req.method === "GET") {
        const body = await readFile(
          join(ROOT, "data/processed/museums-national.csv"),
        );
        res.writeHead(200, {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition":
            'attachment; filename="museums-national-2019.csv"',
          "x-content-type-options": "nosniff",
        });
        res.end(body);
        return;
      }
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
        validateStops(p.stops);
        const ids = new Set(venues().map((v) => v.id));
        if (p.stops.some((s) => !ids.has(s.id))) fail("路线包含尚未确认的馆址");
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
        store.addArtifact(t.id, "agent-roadbook", rel, {
          title: text(p.title, 160) || "Agent路书",
          format: p.format,
          revision: t.revision,
          sha256: createHash("sha256").update(p.content).digest("hex"),
        });
        return json(res, 201, { artifacts: store.artifacts() });
      }
      if (path === PREFIX + "/export" && req.method === "POST") {
        const p = await payload(req),
          t = trip(p.tripId);
        if (p.revision !== t.revision) throw new RevisionConflict();
        if (!t.stops.length) fail("请先加入馆址");
        if (!["md", "csv", "json", "html"].includes(p.format))
          fail("不支持的导出格式");
        const vv = new Map(venues().map((v) => [v.id, v])),
          rows = t.stops.map((s, i) => ({
            ...vv.get(s.id),
            ...s,
            position: i + 1,
          }));
        const snapshot = {
          schemaVersion: 1,
          tripId: t.id,
          title: t.title,
          revision: t.revision,
          settings: t.settings,
          stops: rows,
          exportedAt: new Date().toISOString(),
          baseYear: 2019,
        };
        let content;
        if (p.format === "json") content = JSON.stringify(snapshot, null, 2);
        else if (p.format === "csv") content = csvText(rows);
        else {
          const lines = [
            "# " + t.title,
            "",
            `日期：${t.settings.date || "待定"}；交通：${t.settings.mode}`,
            "",
            "> 历史等级不代表当前等级；开放需按出行日复核。直线距离不是道路导航。",
            "",
            ...rows.flatMap((v, i) => [
              `## ${i + 1}. 第${v.day}天 · ${v.name}`,
              `- 馆址ID：${v.id}`,
              `- 地址：${v.address}`,
              `- 坐标：${v.longitude},${v.latitude}（${v.crs}）`,
              `- 参观规划：${v.minutes}分钟`,
              `- 常规开放：${v.openingHours || "未知"}`,
              `- 状态：${v.openingStatus || "unknown"}；有效期：${v.validFrom || "待核实"} 至 ${v.validTo || "待核实"}`,
              `- 点位来源：${v.sourceUrl}`,
              `- 介绍：${v.intro || "待补"}`,
              `- 介绍来源：${v.introSource || v.officialUrl || "待补"}`,
              "",
            ]),
          ];
          content = lines.join("\n");
          if (p.format === "html") {
            const esc = (s) =>
              s.replace(
                /[&<>"']/g,
                (c) =>
                  ({
                    "&": "&amp;",
                    "<": "&lt;",
                    ">": "&gt;",
                    '"': "&quot;",
                    "'": "&#39;",
                  })[c],
              );
            content =
              '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>' +
              esc(t.title) +
              "</title><style>body{max-width:850px;margin:40px auto;padding:0 24px;font:16px/1.8 system-ui;color:#253c37}pre{white-space:pre-wrap}</style><pre>" +
              esc(content) +
              "</pre></html>";
          }
        }
        const folder = await tripFolder(t);
        await safeOutput(folder);
        const rel = "output/" + randomUUID() + "." + p.format;
        await atomic(join(folder, rel), content);
        const hash = createHash("sha256").update(content).digest("hex"),
          id = store.addArtifact(t.id, "route-export", rel, {
            title: t.title,
            format: p.format,
            revision: t.revision,
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
