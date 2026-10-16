export const placeKinds = {
  museum: "博物馆",
  food: "美食",
  attraction: "景点",
  citywalk: "Citywalk",
};
export function roadbookText(s) {
  const rows = s.stops?.length ? s.stops : s.selections || [];
  return [
    "# " + s.title,
    `目的地：${s.destination || "待定"} · ${s.stops?.length ? "已编排" : "待编排"} · 输入版本 ${s.revision}`,
    `日期：${s.date || "待定"}；交通：${s.mode || "待定"}`,
    "",
    "> 开放、预约、维修和交通需出发前核实；规划时长不等于馆方承诺。",
    ...rows.flatMap((v, i) => [
      "",
      `## ${i + 1}. ${v.day ? "Day " + v.day : "待编排"} · ${v.name}`,
      `- 类别：${placeKinds[v.kind || "museum"] || "地点"}`,
      `- 地址：${v.address || "待补"}`,
      `- 规划停留：${v.minutes ? v.minutes + "分钟" : "待编排"}`,
      `- 特色：${v.intro || "待核实"}`,
      `- 常规开放：${v.openingHours || "未知"}；当天状态待核实`,
      v.rating
        ? `- 高德评分：${v.rating.value}${v.rating.scale ? " / " + v.rating.scale : "（平台原始值；范围未提供）"}（${v.rating.checkedAt || "日期未提供"}）`
        : "- 评分：来源未提供",
      `- 来源：${v.sourceUrl || "待补"}`,
      `- 信息核实日：${v.checkedAt || "未记录"}`,
    ]),
  ].join("\n");
}
export function roadbookHtml(s) {
  const escape = (v) =>
    String(v ?? "").replace(
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
  return (
    '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' +
    escape(s.title) +
    "</title><style>body{max-width:780px;margin:40px auto;padding:0 24px;background:#f7f9f5;color:#29453d;font:17px/1.85 system-ui}pre{white-space:pre-wrap;overflow-wrap:anywhere}h1{font-size:28px}</style><h1>" +
    escape(s.title) +
    "</h1><pre>" +
    escape(roadbookText(s)) +
    "</pre></html>"
  );
}

// Share a deliberate public projection rather than serializing a live business object.
export function publicSnapshot(s) {
  const publicUrl = (value) => {
    try {
      const u = new URL(value);
      if (
        !["https:", "http:"].includes(u.protocol) ||
        u.username ||
        u.password ||
        /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[?::1\]?$)/i.test(
          u.hostname,
        ) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(u.hostname)
      )
        return "";
      for (const name of [...u.searchParams.keys()])
        if (/key|token|secret|password|session/i.test(name))
          u.searchParams.delete(name);
      return u.href;
    } catch {
      return "";
    }
  };
  const place = (v) =>
    Object.fromEntries(
      [
        "id",
        "kind",
        "name",
        "city",
        "province",
        "district",
        "address",
        "longitude",
        "latitude",
        "crs",
        "day",
        "minutes",
        "intro",
        "featuredExhibits",
        "openingHours",
        "openingStatus",
        "checkedAt",
        "validFrom",
        "validTo",
        "grade",
        "gradeAsOf",
        "themes",
        "rating",
      ]
        .filter((k) => v[k] !== undefined)
        .map((k) => [k, v[k]])
        .concat(
          ["sourceUrl", "officialUrl", "introSource", "wechatUrl"].map((k) => [
            k,
            publicUrl(v[k]),
          ]),
        ),
    );
  return {
    schemaVersion: 2,
    title: s.title,
    revision: s.revision,
    destination: s.destination,
    date: s.date,
    mode: s.mode,
    status: s.status,
    selections: (s.selections || []).map(place),
    stops: (s.stops || []).map(place),
  };
}
