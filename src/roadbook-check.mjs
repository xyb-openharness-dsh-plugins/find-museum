const scalar = (v) => (typeof v === "string" ? v.trim() : "");
const plus = (date, days) => {
  const d = new Date(date + "T00:00:00Z");
  if (Number.isNaN(+d) || d.toISOString().slice(0, 10) !== date)
    throw Error("行程日期无效");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
export function weatherWindow(snapshot) {
  if (!snapshot.date) return null;
  const last = Math.max(
    1,
    ...(snapshot.stops || []).map((s) => (Number.isInteger(s.day) ? s.day : 1)),
  );
  if (last > 30) throw Error("最多30天");
  const start = plus(snapshot.date, -1),
    end = plus(snapshot.date, last),
    dates = [];
  for (let d = start; d <= end; d = plus(d, 1)) dates.push(d);
  return { start, end, dates };
}
export function weatherAlerts(cast) {
  const text = [cast.dayweather, cast.nightweather].filter(Boolean).join(" / "),
    alerts = [];
  if (/暴雨|雷阵雨|雷暴|暴雪|台风|沙尘/.test(text))
    alerts.push(
      "预报有" + text + "，请关注馆方和交通动态，减少受影响的户外安排。",
    );
  const wind = [cast.daypower, cast.nightpower]
    .filter((x) => typeof x === "string")
    .join(" ");
  if ((wind.match(/\d+/g) || []).some((n) => Number(n) >= 6))
    alerts.push("预报风力较大，请留意交通与户外步行安排。");
  const temps = [cast.daytemp, cast.nighttemp]
    .filter(
      (v) =>
        typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)),
    )
    .map(Number);
  if (temps.some((v) => v >= 35))
    alerts.push(
      "预报气温较高，建议减少馆外长距离步行，安排饮水与休息。此为行程提醒，不是官方预警。",
    );
  if (temps.some((v) => v <= 0))
    alerts.push(
      "预报有低温，请准备保暖衣物并关注当地交通与路况。此为行程提醒，不是官方预警。",
    );
  return alerts;
}
async function pool(items, fn, limit = 3) {
  const results = new Array(items.length);
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (index < items.length) {
        const i = index++;
        results[i] = await fn(items[i]);
      }
    }),
  );
  return results;
}
export async function checkRoadbook(archive, amap, currentPlaces = []) {
  const s = archive.snapshot,
    window = weatherWindow(s),
    checkedAt = new Date().toISOString(),
    deadline = Date.now() + 50000;
  const current = new Map(currentPlaces.map((v) => [v.id, v]));
  const rows = [
    ...new Map(
      [...(s.selections || []), ...(s.stops || [])].map((v) => [
        v.id,
        { ...v, ...current.get(v.id), day: v.day },
      ]),
    ).values(),
  ];
  const museums = rows.filter((v) => !v.kind || v.kind === "museum");
  const idFor = (v) =>
    scalar(v.providerPoiId) ||
    scalar(v.poiId) ||
    (typeof v.id === "string" && v.id.startsWith("amap-") ? v.id.slice(5) : "");
  const ids = [
      ...new Set(museums.map(idFor).filter((id) => /^\w{5,40}$/.test(id))),
    ],
    details = new Map(),
    errors = new Map();
  const batches = Array.from({ length: Math.ceil(ids.length / 10) }, (_, i) =>
    ids.slice(i * 10, i * 10 + 10),
  );
  await pool(batches, async (batch) => {
    if (Date.now() > deadline) {
      for (const id of batch) errors.set(id, "本次核实时限已到，请重试");
      return;
    }
    try {
      const r = await amap("detail2", { ids: batch });
      for (const v of Array.isArray(r.pois) ? r.pois : [])
        if (typeof v.id === "string") details.set(v.id, v);
    } catch (e) {
      for (const id of batch) errors.set(id, e.message || "高德详情读取失败");
    }
  });
  const checks = museums.map((v) => {
    const poiId = idFor(v),
      p = details.get(poiId),
      business = p?.business || {};
    const openingHours =
      scalar(business.opentime_week) ||
      scalar(business.opentime_today) ||
      scalar(p?.biz_ext?.open_time);
    const visitDate = s.date ? plus(s.date, (v.day || 1) - 1) : null,
      alerts = [];
    if (
      v.openingStatus === "closed" &&
      visitDate &&
      v.validFrom &&
      v.validTo &&
      v.validFrom <= visitDate &&
      visitDate <= v.validTo
    )
      alerts.push(
        "已记录的闭馆公告覆盖参观日期，请优先改期并复核馆方最新通知。",
      );
    const todayDescription = scalar(business.opentime_today);
    const closingText = [
      scalar(p?.name),
      todayDescription.length <= 40 ? todayDescription : "",
    ].join(" ");
    if (/临时闭馆|暂停开放|暂停营业|暂时关闭|闭馆中/.test(closingText))
      alerts.push("高德返回了暂停或关闭相关文字，需核对适用日期及馆方公告。");
    if (
      /(?:周一|星期一)[^；。;\n]{0,25}(?:闭馆|不开放|休息)/.test(
        openingHours || v.openingHours || "",
      ) &&
      visitDate &&
      new Date(visitDate + "T00:00:00Z").getUTCDay() === 1
    )
      alerts.push(
        "参观日期为周一，常规时间包含周一休息相关描述，请核对节假日例外。",
      );
    return {
      id: v.id,
      poiId,
      name: v.name,
      visitDate,
      status: p ? "queried" : "unverified",
      openingHours,
      previousOpeningHours: v.openingHours || "",
      changed: !!openingHours && openingHours !== (v.openingHours || ""),
      address: scalar(p?.address),
      tel: scalar(business.tel),
      sourceUrl: v.sourceUrl || "https://www.amap.com",
      checkedAt,
      alerts,
      error: p
        ? ""
        : errors.get(poiId) ||
          (poiId
            ? "高德未返回此POI"
            : "没有标准高德POI ID，请先匹配或请Agent核实"),
      closureVerified: false,
    };
  });
  const cities = [
    ...new Set(
      rows.map((v) => scalar(v.city) || scalar(s.destination)).filter(Boolean),
    ),
  ].slice(0, 12);
  const weather = window
    ? await pool(cities, async (city) => {
        try {
          if (Date.now() > deadline) throw Error("本次核实时限已到，请重试");
          const geo = await amap("geo", { city, address: city }),
            adcode = scalar(geo.geocodes?.[0]?.adcode);
          if (!/^\d{6}$/.test(adcode)) throw Error("未取得城市天气编码");
          const r = await amap("weather", { city: adcode }),
            f = Array.isArray(r.forecasts) ? r.forecasts[0] : null;
          if (!f || !Array.isArray(f.casts))
            throw Error("天气服务未返回有效预报");
          const casts = f.casts
            .filter((c) => window.dates.includes(c.date))
            .map((c) => ({
              date: scalar(c.date),
              dayweather: scalar(c.dayweather),
              nightweather: scalar(c.nightweather),
              daytemp: scalar(c.daytemp),
              nighttemp: scalar(c.nighttemp),
              daypower: scalar(c.daypower),
              nightpower: scalar(c.nightpower),
              alerts: weatherAlerts(c),
            }));
          return {
            city,
            status: "queried",
            reportTime: scalar(f.reporttime),
            casts,
            missingDates: window.dates.filter(
              (d) => !casts.some((c) => c.date === d),
            ),
            sourceUrl:
              "https://lbs.amap.com/api/webservice/guide/api-advanced/weatherinfo",
            checkedAt,
          };
        } catch (e) {
          return {
            city,
            status: "unverified",
            casts: [],
            missingDates: window.dates,
            error: e.message,
            checkedAt,
          };
        }
      })
    : [];
  return {
    schemaVersion: 1,
    roadbookId: archive.id,
    inputRevision: archive.input_revision,
    checkedAt,
    window,
    checks,
    weather,
    notice:
      "高德POI与常规时间不等于出行日开放保证；临时闭馆公告需馆方核实。天气超出服务范围的日期保留待更新，不推断官方预警等级。",
  };
}
export function enrichSnapshot(snapshot, report, currentPlaces = []) {
  const facts = new Map(currentPlaces.map((v) => [v.id, v]));
  const enrich = (v) => {
    const checked = report.checks.find((c) => c.id === v.id),
      fresh = facts.get(v.id);
    return {
      ...v,
      ...(fresh
        ? {
            intro: fresh.intro,
            introSource: fresh.introSource,
            officialUrl: fresh.officialUrl,
            exhibitSource: fresh.exhibitSource,
            featuredExhibits: fresh.featuredExhibits,
            transportIntro: fresh.transportIntro,
            transportSource: fresh.transportSource,
          }
        : {}),
      ...(checked?.openingHours
        ? {
            openingHours: checked.openingHours,
            openingHoursSource: "amap",
            hoursCheckedAt: report.checkedAt,
          }
        : {}),
      visitCheck: checked || null,
    };
  };
  return {
    ...snapshot,
    selections: (snapshot.selections || []).map(enrich),
    stops: (snapshot.stops || []).map(enrich),
    preflight: report,
  };
}
