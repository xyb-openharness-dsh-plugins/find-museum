import test from "node:test";
import assert from "node:assert/strict";
import {
  publicSnapshot,
  personalizedHtmlPrompt,
  roadbookHtml,
  roadbookText,
} from "../src/domain/roadbook.mjs";
test("分享只输出公开字段，去本机地址及查询凭据；HTML转义且不拉伸正文", () => {
  const s = publicSnapshot({
    title: "<img src=x onerror=alert(1)>",
    revision: 3,
    settings: { folder: "/Users/private", key: "secret" },
    tripId: "private-id",
    selections: [],
    stops: [
      {
        id: "1",
        name: "馆",
        kind: "museum",
        day: 1,
        minutes: 240,
        note: "私密",
        sessionId: "session-private",
        sourceUrl: "https://museum.example/info?api_key=secret&q=exhibit",
        officialUrl: "http://127.0.0.1:4391/file",
        address: "公开地址",
      },
    ],
  });
  const json = JSON.stringify(s);
  assert.ok(!json.includes("secret"));
  assert.ok(!json.includes("private"));
  assert.ok(!json.includes("127.0.0.1"));
  assert.ok(!json.includes("私密"));
  assert.equal(s.stops[0].sourceUrl, "https://museum.example/info?q=exhibit");
  assert.ok(!roadbookHtml(s).includes("<img"));
  assert.match(roadbookHtml(s), /&lt;img/);
  assert.match(roadbookText(s), /Day 1/);
});

test("个性化HTML提示词先互动、按日期前后1天查天气且不夸大工具", () => {
  const p = personalizedHtmlPrompt(
    {
      title: "我的路书",
      revision: 3,
      stops: [],
      selections: [{ id: "a", name: "测试馆" }],
    },
    { version: 2, inputRevision: 3 },
  );
  assert.match(p, /先确认我的偏好/);
  assert.match(p, /开始前1天到结束后1天/);
  assert.match(p, /未到预报期/);
  assert.match(p, /实际可用/);
  assert.match(p, /测试馆/);
  assert.match(p, /output\/roadbook-custom.html/);
  assert.match(p, /用户确认/);
});

test("核实附页及单馆核实来源同样清理凭据和私有字段", () => {
  const c = {
    name: "馆",
    sourceUrl: "https://museum.example/?token=secret",
    alerts: [],
    sessionId: "private",
    error: "",
    closureVerified: false,
  };
  const report = {
    checkedAt: "2026-10-16",
    window: null,
    checks: [c],
    weather: [
      {
        city: "苏州",
        sourceUrl: "http://127.0.0.1/private",
        casts: [],
        missingDates: [],
        note: "private",
      },
    ],
    config: { key: "secret" },
  };
  const json = JSON.stringify(
    publicSnapshot({
      title: "分享",
      preflight: report,
      selections: [],
      stops: [{ name: "馆", visitCheck: c }],
    }),
  );
  assert.ok(!json.includes("secret"));
  assert.ok(!json.includes("private"));
  assert.ok(!json.includes("127.0.0.1"));
});
