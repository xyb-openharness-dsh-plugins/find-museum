import test from "node:test";
import assert from "node:assert/strict";
import {
  publicSnapshot,
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
