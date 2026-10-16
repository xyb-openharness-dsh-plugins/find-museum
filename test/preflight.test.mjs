import test from "node:test";
import assert from "node:assert/strict";
import {
  weatherWindow,
  weatherAlerts,
  checkRoadbook,
  enrichSnapshot,
} from "../src/roadbook-check.mjs";
const archive = {
  id: "book",
  input_revision: 2,
  snapshot: {
    title: "测试路书",
    revision: 2,
    date: "2026-10-19",
    destination: "苏州",
    selections: [
      {
        id: "amap-B000001",
        name: "测试馆",
        city: "苏州",
        openingHours: "周一休息",
        sourceUrl: "https://museum.example",
      },
    ],
    stops: [
      {
        id: "amap-B000001",
        name: "测试馆",
        city: "苏州",
        day: 1,
        minutes: 240,
        openingHours: "周一休息",
        sourceUrl: "https://museum.example",
      },
      {
        id: "food",
        name: "餐馆",
        kind: "food",
        city: "苏州",
        day: 2,
        minutes: 60,
      },
    ],
  },
};
test("天气覆盖行程首尾各1天、按真实日期匹配，非法日期拒绝", () => {
  assert.deepEqual(weatherWindow(archive.snapshot).dates, [
    "2026-10-18",
    "2026-10-19",
    "2026-10-20",
    "2026-10-21",
  ]);
  assert.equal(weatherWindow({ stops: [] }), null);
  assert.throws(() => weatherWindow({ date: "2026-02-30", stops: [] }));
  assert.ok(
    weatherAlerts({ dayweather: "雷阵雨", daypower: "6-7" }).length === 2,
  );
  assert.deepEqual(weatherAlerts({ dayweather: "晴", daypower: "≤3" }), []);
});
test("核实去重POI、没有闭馆信息不宣布正常开放，未知日期天气不补造", async () => {
  const calls = [];
  const report = await checkRoadbook(archive, async (action, params) => {
    calls.push(action);
    if (action === "detail2") {
      assert.deepEqual(params.ids, ["B000001"]);
      return {
        pois: [
          {
            id: "B000001",
            name: "测试馆",
            business: { opentime_week: "周一休息；周二至周日9-17" },
          },
        ],
      };
    }
    if (action === "geo") return { geocodes: [{ adcode: "320500" }] };
    if (action === "weather")
      return {
        forecasts: [
          {
            reporttime: "2026-10-16 11:00:00",
            casts: [
              {
                date: "2026-10-19",
                dayweather: "雷阵雨",
                nightweather: "阴",
                daytemp: "25",
                nighttemp: "18",
                daypower: "4-5",
              },
            ],
          },
        ],
      };
  });
  assert.deepEqual(calls, ["detail2", "geo", "weather"]);
  assert.equal(report.checks.length, 1);
  assert.equal(report.checks[0].closureVerified, false);
  assert.ok(report.checks[0].alerts.some((x) => x.includes("周一")));
  assert.equal(report.weather[0].missingDates.length, 3);
  assert.ok(report.weather[0].casts[0].alerts.length > 0);
  const enriched = enrichSnapshot(archive.snapshot, report);
  assert.equal(enriched.stops[0].openingHours, "周一休息；周二至周日9-17");
  assert.equal(archive.snapshot.stops[0].openingHours, "周一休息");
  assert.equal(enriched.preflight, report);
});
test("无权限或高德失败被记录，不能变成已核实；无日期不查伪旅行天气", async () => {
  const report = await checkRoadbook(archive, async () => {
    throw Error("配额不足");
  });
  assert.equal(report.checks[0].status, "unverified");
  assert.equal(report.weather[0].status, "unverified");
  assert.match(report.weather[0].error, /配额/);
  const noDate = await checkRoadbook(
    { ...archive, snapshot: { ...archive.snapshot, date: "" } },
    async () => ({ pois: [] }),
  );
  assert.equal(noDate.window, null);
  assert.deepEqual(noDate.weather, []);
});

test("条件性闭馆说明不当成正在闭馆，低高温仅作为行程提醒", async () => {
  const report = await checkRoadbook(archive, async (action) => action === "detail2" ? {pois:[{id:"B000001",name:"测试馆",business:{opentime_week:"周二至周日开放；如遇设备维护，可根据需要临时闭馆，届时另行公告。",opentime_today:"09:00–17:00"}}]} : action === "geo" ? {geocodes:[]} : {});
  assert.deepEqual(report.checks[0].alerts, []);
  assert.ok(weatherAlerts({daytemp:"35",nighttemp:"25"}).some(x=>x.includes("不是官方预警")));
  assert.ok(weatherAlerts({daytemp:"5",nighttemp:"0"}).some(x=>x.includes("低温")));
});
