import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const text = readFileSync(new URL("../dsh/index.js", import.meta.url), "utf8");
const code = text.replace(/^import .*?;\n/gm, "").replace(/export /g, "");
function fixture(connection) {
  let handled = 0,
    closed = 0;
  const routes = [];
  const module = new Function(
    "Schema",
    "createService",
    "routes",
    code + ";return {apply,inject,Config};",
  )(
    { object: () => ({ schema: true }) },
    () => ({ handle: () => handled++, close: () => closed++ }),
    ["/api/find-museum/health"],
  );
  const effects = [];
  module.apply({
    connection,
    effect: (fn) => effects.push(fn()),
    webServer: {
      register: (r) => {
        routes.push(r);
        return () => {};
      },
    },
  });
  return { module, routes, handled: () => handled, effects };
}
test("服务端inject必须是真实服务名数组，不使用required/optional伪字段", () => {
  const f = fixture({ requestRejection: () => undefined });
  assert.deepEqual(f.module.inject, ["webServer", "connection"]);
  assert.equal(f.module.Config.schema, true);
  assert.equal(f.routes[0].kind, "exact");
});
test("服务端每条入口先做宿主连接鉴权，不可用时失败关闭", () => {
  for (const [connection, expected] of [
    [{}, 503],
    [{ requestRejection: () => 401 }, 401],
  ]) {
    const f = fixture(connection);
    let status;
    f.routes[0].handler({}, { writeHead: (s) => (status = s), end: () => {} });
    assert.equal(status, expected);
    assert.equal(f.handled(), 0);
  }
  const ok = fixture({ requestRejection: () => undefined });
  ok.routes[0].handler({}, {});
  assert.equal(ok.handled(), 1);
});
