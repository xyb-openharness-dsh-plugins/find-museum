import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("地图代理校验参数、缓存合法图片，错误响应不泄漏密钥", async () => {
  const dir = await mkdtemp(join(tmpdir(), "museum-map-"));
  const previous = process.env.FIND_MUSEUM_SECRETS_FILE,
    originalFetch = globalThis.fetch;
  const fakeKey = "0".repeat(32);
  process.env.FIND_MUSEUM_SECRETS_FILE = join(dir, "secrets.json");
  await writeFile(
    process.env.FIND_MUSEUM_SECRETS_FILE,
    JSON.stringify({ amapWebServiceKey: fakeKey }),
  );
  try {
    const { mapImage } = await import("../src/maps.mjs?map-unit");
    let calls = 0;
    globalThis.fetch = async (url) => {
      calls++;
      assert.equal(url.hostname, "restapi.amap.com");
      assert.equal(url.searchParams.get("key"), fakeKey);
      return new Response(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), {
        status: 200,
      });
    };
    const url = new URL(
      "http://local/map?lng=120.6&lat=31.3&zoom=10&width=600&height=400",
    );
    const first = await mapImage(url);
    assert.equal(first.mime, "image/png");
    await mapImage(url);
    assert.equal(calls, 1);
    await assert.rejects(
      mapImage(new URL("http://local/map?lng=bad")),
      /参数无效/,
    );
    assert.equal(calls, 1);
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ infocode: "10001", info: fakeKey }), {
        status: 200,
      });
    url.searchParams.set("zoom", "11");
    await assert.rejects(
      mapImage(url),
      (e) => e.message.includes("10001") && !e.message.includes(fakeKey),
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (previous === undefined) delete process.env.FIND_MUSEUM_SECRETS_FILE;
    else process.env.FIND_MUSEUM_SECRETS_FILE = previous;
    await rm(dir, { recursive: true, force: true });
  }
});
