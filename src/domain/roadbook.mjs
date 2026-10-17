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
    `目的地：${s.destination || "待定"} · ${s.stops?.length ? "已编排" : "待编排"}`,
    `日期：${s.date || "待定"}；交通：${s.mode || "待定"}`,
    "",
    "> 开放、预约、维修和交通需出发前核实；规划时长不等于馆方承诺。",
    ...rows.flatMap((v, i) => [
      "",
      `## ${i + 1}. ${v.day ? "Day " + v.day : "待编排"} · ${v.name}`,
      `- 类别：${placeKinds[v.kind || "museum"] || "地点"}`,
      `- 地址：${v.address || "待补"}`,
      `- 规划停留：${v.minutes ? v.minutes + "分钟" : "待编排"}`,
      `- ${v.kind === "food" ? "体验备注" : v.kind === "citywalk" ? "路线提示" : "介绍"}：${v.intro || "待核实"}`,
      ...(v.kind === "museum" || !v.kind
        ? [`- 代表展品：${v.featuredExhibits || "待核实；馆藏不代表当前在展"}`]
        : []),
      `- 交通：${v.transportIntro || "待核实"}`,
      `- ${v.kind === "food" ? "营业信息" : "开放信息"}：${v.openingHours || "未知"}；当天状态待核实`,
      v.rating
        ? `- 高德评分：${v.rating.value}${v.rating.scale ? " / " + v.rating.scale : "（平台原始值；范围未提供）"}（${v.rating.checkedAt || "日期未提供"}）`
        : "- 评分：来源未提供",
      `- 来源：${v.sourceUrl || "待补"}`,
      `- 信息核实日：${v.checkedAt || "未记录"}`,
    ]),
    ...(s.preflight
      ? [
          "",
          "## 天气与参访提醒",
          s.preflight.window
            ? `范围：${s.preflight.window.start}—${s.preflight.window.end}（行程前后各1天）`
            : "行程日期待定",
          `查询：${s.preflight.checkedAt}`,
          s.preflight.notice,
          ...s.preflight.checks.flatMap((c) => [
            `${c.name}：${c.status === "queried" ? "高德已查询，临时公告未确认" : "未核实"}`,
            ...c.alerts,
            ...(c.error ? [c.error] : []),
          ]),
          ...s.preflight.weather.flatMap((w) => [
            `${w.city} · 高德发布 ${w.reportTime || "未取得"}`,
            ...w.casts.flatMap((d) => [
              `${d.date} ${d.dayweather}/${d.nightweather} ${d.nighttemp}—${d.daytemp}℃`,
              ...d.alerts,
            ]),
            ...(w.missingDates.length
              ? [`未到预报期或无数据：${w.missingDates.join("、")}`]
              : []),
            ...(w.error ? [w.error] : []),
          ]),
        ]
      : []),
  ].join("\n");
}
export function roadbookHtml(s, { motifSvg = "" } = {}) {
  const e = (v) =>
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
  const rows = s.stops?.length ? s.stops : s.selections || [],
    days = [...new Set(rows.map((v) => v.day || 0))].sort((a, b) => a - b),
    report = s.preflight;
  const detail = (v) => {
    const isMuseum = !v.kind || v.kind === "museum";
    return `<article class="visit"><div class="visit-title"><span>${e(placeKinds[v.kind || "museum"])}</span><h3>${e(v.name)}</h3><b>${v.minutes ? e(v.minutes / 60) + " 小时" : "待安排"}</b></div><p class="address">${e(v.address || "地址待补")}</p><div class="visit-body"><section><h4>${isMuseum ? "馆方与展陈信息" : v.kind === "food" ? "饮食体验备注" : v.kind === "citywalk" ? "步行路线提示" : "地点介绍"}</h4><p>${e(v.intro || "介绍待核实")}</p>${isMuseum ? `<h4>值得留意</h4><p>${e(v.featuredExhibits || "代表展品待核实；馆藏不代表当前在展。")}</p>` : ""}</section><section><h4>${isMuseum ? "参访信息" : "开放与到达"}</h4><p>${e(v.openingHours || "开放信息待核实")}</p><p>${isMuseum ? "预约与最后入馆：请核对馆方当天安排。" : "营业、预约与临时状态请以提供方公告为准。"}</p><h4>怎么到达</h4><p>${e(v.transportIntro || "交通信息待核实；请以实际入口为导航终点。")}</p></section></div>${v.visitCheck?.alerts?.map((t) => `<p class="notice">△ ${e(t)}</p>`).join("") || ""}<div class="sources">${[
      ["位置来源", v.sourceUrl],
      ["馆方信息", v.officialUrl],
      ["介绍来源", v.introSource],
      ["展品来源", v.exhibitSource],
      ["交通来源", v.transportSource],
    ]
      .filter(([, url]) => Boolean(url))
      .map(([label, url]) => `<a href="${e(url)}" rel="noopener noreferrer">${label} ↗</a>`)
      .join(" · ")}</div></article>`;
  };
  const weather = report
    ? report.weather
        .map(
          (w) =>
            `<section class="weather-city"><h3>${e(w.city)}</h3><p class="small">高德发布：${e(w.reportTime || "未取得")} · 查询：${e(report.checkedAt)}</p>${w.error ? `<p class="notice">天气未核实：${e(w.error)}</p>` : ""}<div class="weather-days">${w.casts.map((d) => `<div><small>${e(d.date)}</small><p>${e(d.dayweather)} / ${e(d.nightweather)}</p><strong>${e(d.nighttemp)}—${e(d.daytemp)}℃</strong>${d.alerts.map((t) => `<p class="notice">△ ${e(t)}</p>`).join("")}</div>`).join("")}</div>${w.missingDates.length ? `<p>未到预报期或无数据：${e(w.missingDates[0])}${w.missingDates.length > 1 ? "—" + e(w.missingDates.at(-1)) : ""}，共${w.missingDates.length}天，请临近出发再更新。</p>` : ""}</section>`,
        )
        .join("")
    : "<p>天气尚未查询。请设定日期，并在导出前核实。</p>";
  const alerts =
    report?.checks.flatMap((c) => [
      ...c.alerts.map((t) => c.name + "：" + t),
      ...(c.error ? [c.name + "：" + c.error] : []),
    ]) || [];
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(s.title)} · 寻馆路书</title><style>
 :root{--paper:#f5f0e6;--ink:#2f4947;--jade:#648f82;--line:#cad5cc;--wash:#e4eee6;--blue:#e5edf0;--warn:#94533c}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:17px/1.95 "FangSong","仿宋","STFangsong","Songti SC",serif}main{max-width:1060px;margin:auto;padding:36px 56px 70px}a{color:inherit;text-decoration:underline;text-underline-offset:4px;overflow-wrap:anywhere}.masthead{display:flex;justify-content:space-between;gap:24px;align-items:center;border-bottom:1px solid var(--line);padding-bottom:20px;letter-spacing:3px;font-size:14px}.seal{border:1px solid #a34c40;color:#a34c40;padding:3px 7px;line-height:1.4;letter-spacing:3px}.cover{position:relative;padding:64px 0 46px;isolation:isolate}.eyebrow{font-size:13px;letter-spacing:4px;color:var(--jade)}h1{font-size:clamp(34px,5vw,60px);font-weight:500;letter-spacing:4px;line-height:1.5;max-width:72%;margin:18px 0 22px}h2{font-size:28px;font-weight:500;letter-spacing:3px;margin:0}h3{font-size:23px;font-weight:500;margin:0}h4{font-size:15px;letter-spacing:2px;font-weight:500;color:var(--jade);margin:0 0 10px}p{margin:8px 0 20px}.motif{position:absolute;right:0;bottom:20px;width:34%;opacity:.10;z-index:-1}.motif svg{display:block;width:100%;height:auto}.subtitle{max-width:34em;color:#5d716d}.meta{display:flex;gap:20px;flex-wrap:wrap;margin-top:28px;font-size:15px}.overview{border-block:1px solid var(--line);display:grid;grid-template-columns:repeat(3,1fr);gap:24px;padding:24px 0;margin-bottom:46px}.overview strong{font-size:24px;font-weight:500;display:block}.overview span{font-size:13px;color:#5d716d}.chapter{margin:0 0 48px}.chapter-head{display:flex;gap:24px;align-items:baseline;border-bottom:1px solid var(--line);padding-bottom:14px;margin-bottom:8px}.day-tag{font:13px/1.5 system-ui,sans-serif;letter-spacing:2px;color:var(--jade);min-width:60px}.visit{padding:28px 0;border-bottom:1px solid var(--line);break-inside:avoid}.visit-title{display:flex;gap:16px;align-items:baseline;flex-wrap:wrap}.visit-title span{font-size:13px;color:var(--jade)}.visit-title b{margin-left:auto;font-size:16px;font-weight:400}.address{font-size:14px;color:#5d716d;margin-top:8px}.visit-body{display:grid;grid-template-columns:1.05fr 1fr;gap:40px;margin-top:24px}.visit-body p{font-size:16px;line-height:1.95}.sources{font-size:13px;line-height:1.8;color:#5d716d;margin-top:10px}.notice{border-left:2px solid var(--warn);padding:8px 14px;color:var(--warn);font-size:15px;line-height:1.8;break-inside:avoid}.weather-city{margin:28px 0}.small{font-size:13px;color:#5d716d}.weather-days{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:22px;margin:24px 0}.weather-days>div{border-top:1px solid var(--line);padding:16px 0}.weather-days small{font:13px system-ui,sans-serif}.weather-days p{font-size:15px}.weather-days strong{font:22px/1.5 system-ui,sans-serif;color:var(--jade)}.reminders{background:var(--wash);padding:28px 32px;margin:36px 0}.checklist{padding-left:0;list-style:none}.checklist li{padding:9px 0;border-bottom:1px solid #cbd9d0}.checklist li:before{content:"□";margin-right:12px;color:var(--jade)}footer{border-top:1px solid var(--line);margin-top:44px;padding-top:20px;font-size:13px;line-height:1.9;color:#5d716d}.source-index{overflow-wrap:anywhere;font-size:13px}details{margin-top:20px}summary{cursor:pointer} @media(max-width:680px){main{padding:24px}h1{max-width:100%;font-size:36px}.cover{padding-top:40px}.motif{width:45%;bottom:10px;opacity:.06}.visit-body{grid-template-columns:1fr;gap:8px}.overview{gap:16px}.overview strong{font-size:21px}.meta{gap:12px}.reminders{padding:22px}.masthead{font-size:12px;letter-spacing:1px}.weather-days{grid-template-columns:1fr 1fr}}@media print{@page{size:A4;margin:16mm}body{background:white;font-size:11pt}main{padding:0;max-width:none}.cover{padding:24px 0}h1{font-size:30pt}.chapter{break-before:auto}.sources{font-size:9pt}a{color:inherit}.reminders{background:transparent;border:1px solid var(--line)}details>*{display:block}summary{display:none}.weather-days{grid-template-columns:repeat(4,1fr)}footer{font-size:9pt}}
 </style></head><body><main><header class="masthead"><span>寻馆 · 行旅手册</span><span class="seal">行记</span><span>${e(s.destination || "一城一馆")}</span></header><section class="cover"><div class="motif" aria-hidden="true">${motifSvg}</div><p class="eyebrow">在一座城里，慢慢读</p><h1>${e(s.title)}</h1><p class="subtitle">先走进一座馆，再读懂一方水土。把时间留给真正想看的事物。</p><div class="meta"><span>${e(s.date || "日期待定")} 起</span><span>${e(s.mode || "交通待定")}</span><span>路书 ${e(s.archiveVersion || s.revision || 1)} 版</span></div></section><section class="overview"><div><strong>${days.filter(Boolean).length || "待定"} 天</strong><span>按 Day N 安排</span></div><div><strong>${rows.length} 处</strong><span>本次行程地点</span></div><div><strong>${rows.reduce((n, v) => n + (v.minutes || 0), 0) / 60} 小时</strong><span>规划停留，不含交通</span></div></section>${alerts.length ? `<section class="chapter"><h2>出发前，先留意</h2>${alerts.map((t) => `<p class="notice">△ ${e(t)}</p>`).join("")}</section>` : ""}${days
   .map(
     (day) =>
       `<section class="chapter"><header class="chapter-head"><span class="day-tag">${day ? "DAY " + day : "待编排"}</span><h2>${day ? "这一天，慢慢看" : "想去的地方"}</h2></header>${rows
         .filter((v) => (v.day || 0) === day)
         .map(detail)
         .join("")}</section>`,
   )
   .join(
     "",
   )}<section class="chapter"><header class="chapter-head"><span class="day-tag">WEATHER</span><h2>天候与行装</h2></header><p>${report?.window ? e(report.window.start) + "—" + e(report.window.end) + " · 行程前后各留一天" : "天气范围待行程日期确认"}</p>${weather}<p class="small">普通天气预报不等于气象部门正式预警。请在出发前再次更新；未覆盖日期不推断天气。</p></section><section class="reminders"><h2>参访前的一份小清单</h2><ul class="checklist"><li>核对临时闭馆、维修、周休及节假日例外</li><li>确认预约、身份证件、最后入馆与展厅关闭时间</li><li>核实想看的文物是否在展，保留备选展览</li><li>查好实际入口、地铁公交与最后一段步行</li><li>按天气准备雨具、饮水与舒适鞋履，留出休息</li></ul></section><details class="source-index"><summary>资料来源与核实记录</summary><p>${e(report?.notice || "开放时间与交通仍需出行前核实。")}</p>${rows.map((v) => `<p>${e(v.name)}：${e(v.sourceUrl || "来源待补")}；核实 ${e(v.hoursCheckedAt || v.checkedAt || "未记录")}</p>`).join("")}<p>天气：高德天气服务；查询 ${e(report?.checkedAt || "尚未查询")}。</p></details><footer>由寻馆整理 · ${e(s.title)}<br>背景为原创器物或建筑意象线描，不是文物照片或测绘复原。介绍、馆藏和开放状态以所列来源及馆方当期公告为准。</footer></main></body></html>`;
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
  const pick = (v, keys) =>
    Object.fromEntries(
      keys.filter((k) => v?.[k] !== undefined).map((k) => [k, v[k]]),
    );
  const publicCheck = (c) => ({
    ...pick(c, [
      "id",
      "poiId",
      "name",
      "visitDate",
      "status",
      "openingHours",
      "previousOpeningHours",
      "changed",
      "address",
      "tel",
      "checkedAt",
      "alerts",
      "error",
      "closureVerified",
    ]),
    sourceUrl: publicUrl(c.sourceUrl),
  });
  const publicReport = (r) =>
    r
      ? {
          schemaVersion: 1,
          checkedAt: r.checkedAt,
          window: r.window ? pick(r.window, ["start", "end", "dates"]) : null,
          notice: r.notice,
          checks: (r.checks || []).map(publicCheck),
          weather: (r.weather || []).map((w) => ({
            ...pick(w, [
              "city",
              "status",
              "reportTime",
              "missingDates",
              "checkedAt",
              "error",
            ]),
            sourceUrl: publicUrl(w.sourceUrl),
            casts: (w.casts || []).map((c) =>
              pick(c, [
                "date",
                "dayweather",
                "nightweather",
                "daytemp",
                "nighttemp",
                "daypower",
                "nightpower",
                "alerts",
              ]),
            ),
          })),
        }
      : undefined;
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
        "openingHoursSource",
        "hoursCheckedAt",
        "transportIntro",
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
          [
            "sourceUrl",
            "officialUrl",
            "introSource",
            "exhibitSource",
            "wechatUrl",
            "transportSource",
          ].map((k) => [k, publicUrl(v[k])]),
          [
            [
              "visitCheck",
              v.visitCheck ? publicCheck(v.visitCheck) : undefined,
            ],
          ],
        ),
    );
  return {
    schemaVersion: 2,
    archiveVersion: s.archiveVersion,
    preflight: publicReport(s.preflight),
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

export function personalizedHtmlPrompt(
  snapshot,
  { version = 1, inputRevision = snapshot.revision } = {},
) {
  return [
    "请与我互动，基于下面这份冻结路书定制一份可下载的单文件HTML文旅路书。先确认我的偏好，再生成最终文件。",
    `输入档案版本：${version}；inputRevision：${inputRevision}。旧档案不可直接改写。`,
    "第一轮合并询问：同行人/无障碍需求、交通方式、预算与餐饮偏好、文物主题、国风浓淡与阅读方式；已知信息沿用，不重复问城市和已排好的站点。缺日期先确认起止日期，保留Day N。",
    "设计：若会话中实际有taste/frontend-design等技能，请使用。主风格宋韵留白，辅以工笔器物线描。绢色底#f5f0e6、墨色#2b2b2b、石绿#5d8a66，朱砂印章只点一处。宋体标题，现代清晰正文16–18px/1.8，手机可读、A4打印，禁重卡片和过密底纹。",
    "结构：封面与目的地/日期/版本 → 行程总览 → Day N逐日顺序 → 每馆地址/开放时间/预约/最后入馆/介绍/典型文物/交通 → 美食与其他地点 → 天气和参访清单 → 来源与核实时间。每馆4–8小时，餐饮和Citywalk独立设置。",
    "核实：使用实际可用高德和搜索工具。导出前更新馆址和常规时间，但高德没有闭馆提示不能代表确认开放；临时闭馆、维修和局部关闭优先核对馆方公告，标来源、发布日期、有效期和核实日。旧收藏不能证明文物正在展出。缺权限或查不到保留待核实，不编结论。",
    "天气范围=行程开始前1天到结束后1天，逐日匹配日期。高德预报通常只覆盖当天及未来3天，范围外写未到预报期，绝不能用今天的天气替代远期日期。雷暴/暴雨/大风等按实际预报给出行提醒，不编造官方预警等级；预警等级需真实气象部门来源。",
    "个性化纹样：优先本路线主馆有来源的代表藏品，不擅自给博物馆排全国第一。红山玉龙只用于主题确实相关的路线。优先原创/获授权透明SVG线稿，5–8%不透明度放留白边角；不要冒充真实文物图像或测绘。没有合适素材先用通用原创器物纹样。",
    "交付：CSS/SVG内联、无API Key/本机路径/会话ID/私人笔记、无远程字体依赖。写项目output/roadbook-custom.html，并提供实际文件位置和预览；若没有文件写入工具，输出完整HTML让用户保存。可读性优先，装饰不得遮挡正文。",
    "回流：新增介绍/文物/交通/闭馆结论整理为带来源的JSON候选，用户确认后再更新工作台；不要直接写SQLite或覆盖旧版本。HTML完成后引导回路书档案，用保存Agent路书登记结果；Agent自行写文件不会自动入库。input/HTML-ROADBOOK.md若存在可参考。",
    "以下为当前选中档案的公开内容：",
    roadbookText(publicSnapshot(snapshot)),
  ].join("\n\n");
}
