import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
const secretPath =
  process.env.FIND_MUSEUM_SECRETS_FILE ||
  join(homedir(), ".config", "find-museum", "local-secrets.json");
const cache = new Map();
let queue = Promise.resolve();
export async function amapConfigured() {
  try {
    const j = JSON.parse(await readFile(secretPath, "utf8"));
    return !!j.amapWebServiceKey;
  } catch {
    return false;
  }
}
async function key() {
  try {
    const j = JSON.parse(await readFile(secretPath, "utf8"));
    if (typeof j.amapWebServiceKey === "string" && j.amapWebServiceKey)
      return j.amapWebServiceKey;
  } catch {}
  throw new Error("本机尚未配置高德Web服务Key");
}
function number(v, min, max) {
  const x = Number(v);
  if (v === null || v === "" || !Number.isFinite(x) || x < min || x > max)
    throw new Error("地图参数无效");
  return x;
}
export async function mapImage(url) {
  const lng = number(url.searchParams.get("lng"), 73, 136),
    lat = number(url.searchParams.get("lat"), 3, 54),
    zoom = number(url.searchParams.get("zoom"), 1, 17),
    width = number(url.searchParams.get("width"), 128, 1024),
    height = number(url.searchParams.get("height"), 128, 1024);
  if (![zoom, width, height].every(Number.isInteger))
    throw new Error("地图级别和尺寸必须是整数");
  const signature = [lng.toFixed(6), lat.toFixed(6), zoom, width, height].join(
    ",",
  );
  const cached = cache.get(signature);
  if (cached && Date.now() - cached.at < 60000) return cached;
  const operation = queue.then(async () => {
    const again = cache.get(signature);
    if (again && Date.now() - again.at < 60000) return again;
    const u = new URL("https://restapi.amap.com/v3/staticmap");
    u.search = new URLSearchParams({
      key: await key(),
      location: `${lng},${lat}`,
      zoom: String(zoom),
      size: `${width}*${height}`,
      scale: "1",
    });
    let response;
    try {
      response = await fetch(u, { signal: AbortSignal.timeout(18000) });
    } catch {
      throw new Error("无法连接高德地图服务，请稍后重试");
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78,
      jpeg = bytes[0] === 255 && bytes[1] === 216;
    if (!response.ok || (!png && !jpeg)) {
      let info = "";
      try {
        const j = JSON.parse(bytes);
        if (typeof j.infocode === "string")
          info = "（错误码" + j.infocode + "）";
      } catch {}
      throw new Error("高德地图返回失败" + info + "，请检查本机Key权限或配额");
    }
    const value = {
      bytes,
      mime: png ? "image/png" : "image/jpeg",
      at: Date.now(),
    };
    if (cache.size >= 50) cache.delete(cache.keys().next().value);
    cache.set(signature, value);
    return value;
  });
  queue = operation.catch(() => {});
  return operation;
}
export async function serveMap(req, res) {
  try {
    const v = await mapImage(new URL(req.url, "http://localhost"));
    res.writeHead(200, {
      "content-type": v.mime,
      "cache-control": "private, max-age=60",
      "x-content-type-options": "nosniff",
    });
    res.end(v.bytes);
  } catch (e) {
    res.writeHead(503, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    });
    res.end(JSON.stringify({ error: e.message }));
  }
}
export async function saveAmapKey(value) {
  if (typeof value !== "string" || !/^[a-fA-F0-9]{32}$/.test(value))
    throw new Error("请输入32位高德Web服务Key");
  const { mkdir, writeFile, rename } = await import("node:fs/promises");
  const { dirname } = await import("node:path");
  await mkdir(dirname(secretPath), { recursive: true, mode: 0o700 });
  let prior = {};
  try {
    prior = JSON.parse(await readFile(secretPath, "utf8"));
  } catch {}
  const tmp = secretPath + ".tmp";
  await writeFile(
    tmp,
    JSON.stringify({ ...prior, amapWebServiceKey: value }) + "\n",
    { mode: 0o600 },
  );
  await rename(tmp, secretPath);
  cache.clear();
}
export async function amapQuery(action, params = {}) {
  const paths = {
    geo: "geocode/geo",
    search: "place/text",
    around: "place/around",
    detail: "place/detail",
    detail2: "place/detail",
    weather: "weather/weatherInfo",
    driving: "direction/driving",
  };
  if (!paths[action]) throw new Error("不支持的高德操作");
  const values = { key: await key() };
  if (action === "geo") {
    values.address = String(params.address || "").slice(0, 200);
    values.city = String(params.city || "").slice(0, 80);
  }
  if (action === "search" || action === "around") {
    values.keywords = String(params.keywords || "").slice(0, 200);
    values.city = String(params.city || "").slice(0, 80);
    const types = {
      museum: "140100",
      food: "050000",
      attraction: "110000",
      citywalk: "110000|140000",
    };
    if (params.kind && !types[params.kind]) throw new Error("不支持的地点类别");
    values.types = types[params.kind || "museum"];
    if (action === "around") {
      if (!/^\d+(\.\d+)?,\d+(\.\d+)?$/.test(params.location || ""))
        throw new Error("推荐中心无效");
      values.location = params.location;
      values.radius = String(
        Math.max(500, Math.min(10000, Number(params.radius) || 3000)),
      );
      values.sortrule = "distance";
    }
    values.offset = "20";
    values.page = "1";
    values.extensions = "all";
  }
  if (action === "detail2") {
    if (
      !Array.isArray(params.ids) ||
      !params.ids.length ||
      params.ids.length > 10 ||
      params.ids.some((id) => typeof id !== "string" || !/^\w{5,40}$/.test(id))
    )
      throw Error("核实POI ID无效");
    values.id = params.ids.join("|");
    values.show_fields = "business,navi";
  }
  if (action === "weather") {
    if (!/^\d{6}$/.test(params.city || "")) throw Error("天气城市编码无效");
    values.city = params.city;
    values.extensions = "all";
  }
  if (action === "detail") {
    if (!/^[\w]{5,40}$/.test(params.id || "")) throw new Error("POI ID无效");
    values.id = params.id;
  }
  if (action === "driving") {
    for (const field of ["origin", "destination"]) {
      if (!/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(params[field] || ""))
        throw new Error("路线经纬度无效");
      values[field] = params[field];
    }
    values.extensions = "base";
    values.strategy = "0";
  }
  const u = new URL(
    "https://restapi.amap.com/" +
      (action === "detail2" ? "v5/" : "v3/") +
      paths[action],
  );
  u.search = new URLSearchParams(values);
  let r;
  try {
    r = await fetch(u, { signal: AbortSignal.timeout(18000) });
  } catch {
    throw new Error("高德连接超时或网络不可用");
  }
  let j;
  try {
    j = await r.json();
  } catch {
    throw new Error("高德返回格式异常");
  }
  if (!r.ok || j.status !== "1")
    throw new Error(
      "高德请求失败（错误码" +
        String(j.infocode || r.status).replace(/[^\w]/g, "") +
        "）",
    );
  return j;
}
