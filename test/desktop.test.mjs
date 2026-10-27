import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
function fixture() {
  const state = {
    active: true,
    session: "s1",
    owner: "owned",
    draft: "原有文字",
    phase: "plain",
    occurrences: [],
    ensures: [],
    posts: [],
    bindings: {},
    writes: [],
    effects: [],
    storage: new Map(),
    folder: null,
  };
  const events = {},
    frame = { contentWindow: { postMessage: (m) => state.posts.push(m) } };
  let module, registered, subscription;
  const React = {
    createElement: (type, props, ...children) => {
      if (type === "iframe" && props.ref) props.ref.current = frame;
      return { type, props, children };
    },
    useState: () => [0, () => {}],
    useRef: () => ({ current: null }),
    useEffect: (fn) => state.effects.push(fn),
  };
  const input = {
    state: {
      getSnapshot: () => ({
        draft: state.draft,
        phase: state.phase,
        occurrences: state.occurrences,
      }),
    },
    setDraft: (d) => {
      state.draft = d;
      state.writes.push(d);
    },
  };
  const ctx = {
    effect: (fn) => state.effects.push(fn),
    desktopWorkbenches: {
      isActive: () => state.active,
      currentSession: () => state.session,
      ownsSession: () => {
        if (state.owner === "unavailable") throw Error("context unavailable");
        return state.owner === "owned";
      },
      ensureSession: async (o) => {
        state.ensures.push(o);
        if (state.ensureWait) await state.ensureWait;
        if (state.onEnsure) state.onEnsure();
        return state.ensureResult || state.session;
      },
      subscribe: (fn) => {
        subscription = fn;
        return () => {};
      },
      register: (d, Panel) => {
        registered = d;
        Panel({});
        return () => {};
      },
    },
    sessions: {
      scope: () => ({ get: () => ({ input: { for: () => input } }) }),
      list: { subscribe: () => () => {} },
    },
    uiWorkspace: { pickDirectory: async () => state.folder },
  };
  const localStorage = {
    getItem: (k) => state.storage.get(k) || null,
    setItem: (k, v) => state.storage.set(k, v),
    removeItem: (k) => state.storage.delete(k),
  };
  const window = {
    location: { origin: "http://host" },
    addEventListener: (t, f) => (events[t] = f),
    removeEventListener: () => {},
    __ModuleLoader__: { load: (d) => (module = d.factory(() => React)) },
  };
  const fetch = async (url, options = {}) => {
    if (options.method === "POST") {
      const p = JSON.parse(options.body);
      state.bindings[p.sessionId] = p.project;
    }
    return {
      ok: true,
      json: async () => ({ bindings: { ...state.bindings } }),
    };
  };
  vm.runInNewContext(
    readFileSync(new URL("../src/client.js", import.meta.url), "utf8"),
    {
      window,
      localStorage,
      fetch,
      setInterval: () => 1,
      clearInterval: () => {},
      console,
      setTimeout,
    },
  );
  module.apply(ctx);
  while (state.effects.length) state.effects.shift()();
  const send = async (data, override = {}) =>
    events.message({
      origin: "http://host",
      source: frame.contentWindow,
      data: { channel: "find-museum-business", requestId: "r", ...data },
      ...override,
    });
  return {
    state,
    module,
    registered,
    frame,
    send,
    follow: () => subscription(),
  };
}
test("Desktop注册使用仓库身份、65%分栏；草稿保留原文且不自动发送", () => {
  const f = fixture();
  assert.equal(
    f.registered.repository,
    "https://github.com/xyb-openharness-dsh-plugins/find-museum",
  );
  assert.equal(f.registered.id, undefined);
  assert.equal(f.registered.layout.businessWidth, 0.65);
  assert.equal(f.registered.customFrame, true, "customFrame 必须由本仓自绘（会话节点经 conversation prop 接入）");
  f.module.appendDraft("s1", "新任务");
  assert.equal(f.state.draft, "原有文字\n\n新任务");
  assert.equal(f.state.writes.length, 1);
});
test("错误来源、非前台、非归属和服务不可用均不写原生草稿", async () => {
  const f = fixture();
  assert.equal(f.module.owner("s1"), "owned");
  for (const override of [{ origin: "http://evil" }, { source: {} }])
    await f.send(
      {
        type: "trip-created",
        tripId: "t1",
        folder: "/trip",
        prompt: "禁止写入",
      },
      override,
    );
  assert.equal(f.state.ensures.length, 0);
  f.state.active = false;
  await f.send({ type: "trip-created", tripId: "t1", folder: "/trip" });
  assert.equal(f.state.ensures.length, 0);
  f.state.active = true;
  f.state.owner = "not-owned";
  assert.throws(() => f.module.appendDraft("s1", "x"), /已切换/);
  f.state.owner = "unavailable";
  assert.equal(f.module.owner("s1"), "unavailable");
  assert.throws(() => f.module.appendDraft("s1", "x"));
  assert.equal(f.state.writes.length, 0);
});
test("含引用/特殊提交阶段的草稿不能被覆盖", () => {
  const f = fixture();
  f.state.occurrences = [{ id: "attachment" }];
  assert.throws(() => f.module.appendDraft("s1", "x"), /引用/);
  f.state.occurrences = [];
  f.state.phase = "submitting";
  assert.throws(() => f.module.appendDraft("s1", "x"), /引用/);
  assert.equal(f.state.draft, "原有文字");
});
test("打开已有旅行不建会话；新旅行建会话并仅追加一次开场白", async () => {
  const f = fixture();
  await f.send({ type: "select-trip", tripId: "existing" });
  assert.equal(f.state.ensures.length, 0);
  await f.send({
    type: "trip-created",
    tripId: "new",
    folder: "/chosen/new",
    prompt: "新旅行开场",
  });
  assert.equal(f.state.ensures[0].folder, "/chosen/new");
  assert.equal(f.state.bindings.s1, "new");
  assert.equal(f.state.draft, "原有文字\n\n新旅行开场");
  f.follow();
  assert.equal(f.state.writes.length, 1);
});
test("新会话切换稍晚时仍等待归属并完成开场草稿初始化", async () => {
  const f = fixture();
  f.state.ensureResult = "s2";
  f.state.onEnsure = () =>
    setTimeout(() => {
      f.state.session = "s2";
      f.state.owner = "owned";
    }, 80);
  await f.send({
    type: "trip-created",
    tripId: "fresh-trip",
    folder: "/chosen/fresh-trip",
    prompt: "这个行程的独立开场白",
  });
  assert.equal(f.state.ensures[0].sessionId, undefined);
  assert.equal(f.state.bindings.s2, "fresh-trip");
  assert.equal(f.state.draft, "原有文字\n\n这个行程的独立开场白");
});
test("已有旅行会复用其关联的原生会话", async () => {
  const f = fixture();
  f.state.bindings["saved-session"] = "saved-trip";
  f.state.session = "saved-session";
  f.state.ensureResult = "saved-session";
  await f.send({ type: "ready" });
  await f.send({
    type: "select-trip",
    tripId: "saved-trip",
  });
  await f.send({
    type: "ensure-session",
    tripId: "saved-trip",
    folder: "/chosen/saved-trip",
  });
  assert.equal(f.state.ensures.at(-1).sessionId, "saved-session");
  assert.equal(f.state.ensures.length, 1);
});
test("浏览其他旅行不会悄悄改写当前原生会话的项目归属", async () => {
  const f = fixture();
  f.state.bindings["s1"] = "trip-a";
  await f.send({ type: "ready" });
  await f.send({ type: "select-trip", tripId: "trip-b" });
  assert.equal(f.state.bindings.s1, "trip-a");
  const context = f.state.posts.findLast((p) => p.type === "context");
  assert.equal(context.tripHasSession, false);
  assert.equal(context.sessionReady, false);
});
test("创建会话期间切换旅行，旧异步结果不追加到新项目", async () => {
  const f = fixture();
  let finish;
  f.state.ensureWait = new Promise((r) => (finish = r));
  const waiting = f.send({
    type: "trip-created",
    tripId: "old",
    folder: "/old",
    prompt: "旧内容",
  });
  await f.send({ type: "select-trip", tripId: "other" });
  finish();
  await waiting;
  assert.equal(f.state.writes.length, 0);
  assert.equal(f.state.bindings.s1, undefined);
});
test("目录选择取消只返回空路径；不调用会话创建", async () => {
  const f = fixture();
  await f.send({ type: "choose-folder" });
  const r = f.state.posts.findLast((p) => p.type === "reply");
  assert.equal(r.ok, true);
  assert.equal(r.result.path, null);
  assert.equal(f.state.ensures.length, 0);
});
