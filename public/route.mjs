export function coordinate(point) {
  if (
    !point ||
    typeof point.longitude !== "number" ||
    typeof point.latitude !== "number" ||
    !Number.isFinite(point.longitude) ||
    !Number.isFinite(point.latitude) ||
    Math.abs(point.longitude) > 180 ||
    Math.abs(point.latitude) > 90
  )
    throw new TypeError("有效的数值经纬度必填");
  if (!["GCJ-02", "WGS84"].includes(point.crs))
    throw new TypeError("必须注明支持的坐标系");
  return point;
}
export function distanceKm(a, b) {
  coordinate(a);
  coordinate(b);
  if (a.crs !== b.crs) throw new TypeError("坐标系不一致");
  const rad = (n) => (n * Math.PI) / 180,
    dlat = rad(b.latitude - a.latitude),
    dlng = rad(b.longitude - a.longitude);
  const value =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(rad(a.latitude)) *
      Math.cos(rad(b.latitude)) *
      Math.sin(dlng / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, value))));
}
export function withinRadius(points, center, radiusKm) {
  coordinate(center);
  if (!Number.isFinite(radiusKm) || radiusKm < 0)
    throw new TypeError("半径必须是非负数");
  const located = [],
    unlocated = [];
  for (const p of points) {
    try {
      const km = distanceKm(center, p);
      if (km <= radiusKm) located.push({ ...p, distanceKm: km });
    } catch {
      unlocated.push(p);
    }
  }
  return {
    located: located.sort(
      (a, b) =>
        a.distanceKm - b.distanceKm || String(a.id).localeCompare(String(b.id)),
    ),
    unlocated,
  };
}
export function moveStop(stops, id, delta) {
  if (!Number.isInteger(delta) || ![-1, 1].includes(delta))
    throw new TypeError("移动仅支持上/下一站");
  const next = stops.map((s) => ({ ...s })),
    i = next.findIndex((s) => s.id === id),
    j = i + delta;
  if (i < 0 || j < 0 || j >= next.length) return next;
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
export function validateStops(stops) {
  if (!Array.isArray(stops) || stops.length > 100)
    throw new TypeError("最多100个站点");
  const seen = new Set();
  for (const s of stops) {
    if (
      !s ||
      typeof s.id !== "string" ||
      seen.has(s.id) ||
      !Number.isInteger(s.day) ||
      s.day < 1 ||
      s.day > 30 ||
      !Number.isInteger(s.minutes) ||
      s.minutes <
        (["food", "attraction", "citywalk"].includes(s.kind) ? 15 : 240) ||
      s.minutes > 480 ||
      (s.kind && !["museum", "food", "attraction", "citywalk"].includes(s.kind))
    )
      throw new TypeError(
        "站点字段无效或重复（博物馆240–480分钟；其他地点15–480分钟）",
      );
    seen.add(s.id);
  }
  return stops;
}
export function csvText(rows) {
  const headers = [
    "顺序",
    "第几天",
    "博物馆",
    "地址",
    "经度",
    "纬度",
    "坐标系",
    "开放状态",
    "参观分钟",
    "来源",
  ];
  const cell = (v) => {
    let s = String(v ?? "");
    if (/^[\s]*[=+@\-]/u.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  return (
    "\uFEFF" +
    [
      headers,
      ...rows.map((r, i) => [
        i + 1,
        r.day,
        r.name,
        r.address,
        r.longitude,
        r.latitude,
        r.crs,
        "出行前待核实",
        r.minutes,
        r.sourceUrl,
      ]),
    ]
      .map((row) => row.map(cell).join(","))
      .join("\r\n")
  );
}
// Approximate GCJ-02 inverse for previewing mainland POIs on a WGS84 basemap.
// Keep original source coordinates. This is not survey/navigation precision.
export function toWgs84(point) {
  coordinate(point);
  if (point.crs === "WGS84") return { ...point };
  const { longitude: lng, latitude: lat } = point;
  if (lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271)
    return { ...point, crs: "WGS84" };
  const x = lng - 105,
    y = lat - 35,
    pi = Math.PI;
  let dy =
    -100 +
    2 * x +
    3 * y +
    0.2 * y * y +
    0.1 * x * y +
    0.2 * Math.sqrt(Math.abs(x));
  dy +=
    ((20 * Math.sin(6 * x * pi) + 20 * Math.sin(2 * x * pi)) * 2) / 3 +
    ((20 * Math.sin(y * pi) + 40 * Math.sin((y / 3) * pi)) * 2) / 3 +
    ((160 * Math.sin((y / 12) * pi) + 320 * Math.sin((y * pi) / 30)) * 2) / 3;
  let dx =
    300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  dx +=
    ((20 * Math.sin(6 * x * pi) + 20 * Math.sin(2 * x * pi)) * 2) / 3 +
    ((20 * Math.sin(x * pi) + 40 * Math.sin((x / 3) * pi)) * 2) / 3 +
    ((150 * Math.sin((x / 12) * pi) + 300 * Math.sin((x / 30) * pi)) * 2) / 3;
  const rad = (lat * pi) / 180;
  let magic = Math.sin(rad);
  magic = 1 - 0.00669342162296594323 * magic * magic;
  const root = Math.sqrt(magic);
  dy =
    (dy * 180) /
    (((6378245 * (1 - 0.00669342162296594323)) / (magic * root)) * pi);
  dx = (dx * 180) / ((6378245 / root) * Math.cos(rad) * pi);
  return {
    ...point,
    longitude: lng - dx,
    latitude: lat - dy,
    crs: "WGS84",
    conversion: "GCJ-02 approximate inverse",
  };
}
