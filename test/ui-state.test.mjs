// DOM-state unit tests. These do not replace browser layout or Desktop acceptance.
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import * as route from "../src/domain/route.mjs";
import * as roadbook from "../src/domain/roadbook.mjs";
function fixture(options = {}) {
  const html = readFileSync(
    new URL("../public/index.html", import.meta.url),
    "utf8",
  );
  const ids = new Map(
    [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => ["#" + m[1], null]),
  );
  const element = () => ({
    value: "",
    dataset: {},
    textContent: "",
    innerHTML: "",
    hidden: false,
    disabled: false,
    open: false,
    classList: { add() {}, remove() {}, toggle() {} },
    setAttribute(k, v) {
      this[k] = v;
    },
    showModal() {
      this.open = true;
    },
    close() {
      this.open = false;
    },
  });
  for (const k of ids.keys()) ids.set(k, element());
  ids.set("#action-form", element());
  for (const k of [".searchbar", ".workflow-steps", ".intro-note"])
    ids.set(k, element());
  const pages = ["discover", "route", "favorites", "results", "data"].map(
    (k) => ({ ...element(), id: k + "-page" }),
  );
  const tabs = pages.map((p) => ({
    ...element(),
    dataset: { tab: p.id.replace("-page", "") },
  }));
  const storage = new Map();
  const window = { addEventListener() {} };
  const document = {
    querySelector(k) {
      if (!ids.has(k)) throw new Error("Unknown static selector " + k);
      return ids.get(k);
    },
    querySelectorAll(k) {
      return k === ".page" ? pages : k === "[data-tab]" ? tabs : [];
    },
    addEventListener() {},
    body: element(),
  };
  const ctx = vm.createContext({
    ...route,
    ...roadbook,
    document,
    window,
    parent: window,
    location: { origin: "http://unit.test" },
    localStorage: {
      getItem: (k) => storage.get(k),
      setItem: (k, v) => storage.set(k, v),
      removeItem: (k) => storage.delete(k),
    },
    setTimeout: () => 1,
    clearTimeout() {},
    requestAnimationFrame: (fn) => fn(),
    crypto: { randomUUID: () => "test-id" },
    fetch:
      options.fetch ||
      (() => {
        throw new Error("Unexpected API request");
      }),
    console,
    URL,
    URLSearchParams,
    Map,
    Set,
    FormData,
  });
  let code = readFileSync(
    new URL("../public/app.js", import.meta.url),
    "utf8",
  ).replace(/^import[\s\S]*?;\n/gm, "");
  const start = code.indexOf("await safe(async () => {");
  assert.ok(start > 0);
  const end = code.indexOf("\n})();", start);
  assert.ok(end > start);
  code = code.slice(0, start) + code.slice(end + 7);
  vm.runInContext(code, ctx);
  return { run: (s) => vm.runInContext(s, ctx), ids, storage, tabs, pages };
}
test("五入口改名与搜索栏可见性，静态ID均能绑定", () => {
  const f = fixture();
  f.run('showTab("data")');
  assert.equal(f.ids.get("#page-title").textContent, "数据配置");
  assert.equal(f.ids.get(".searchbar").hidden, true);
  assert.equal(f.ids.get("#discovery-next").hidden, true);
  assert.equal(f.tabs[4]["aria-current"], "page");
  f.run('showTab("route")');
  assert.equal(f.ids.get("#page-title").textContent, "设计路书");
  assert.equal(f.pages[1].hidden, false);
  assert.equal(f.pages[0].hidden, true);
});
test("无旅行可暂存且下一步启用；不赋予时长；收藏按类别与状态筛选", () => {
  const f = fixture();
  f.run('tab="favorites";stagePlaces([{id:"a",name:"测试馆"}])');
  assert.ok(f.storage.get("find-museum-unassigned"));
  assert.equal(f.ids.get("#discovery-design").disabled, false);
  assert.match(f.ids.get("#discovery-selection").textContent, /尚未保存/);
  assert.ok(!f.storage.get("find-museum-unassigned").includes("minutes"));
  f.run(
    'boot.venues=[{id:"a",name:"测试馆",kind:"museum"},{id:"b",name:"测试餐馆",kind:"food"}];boot.favorites=[{id:"a",visited:false},{id:"b",visited:true,note:"笔记"}];',
  );
  f.ids.get("#favorite-kind").value = "food";
  f.ids.get("#favorite-status").value = "visited";
  f.run("renderFavorites()");
  assert.match(f.ids.get("#favorites-list").innerHTML, /测试餐馆/);
  assert.ok(!f.ids.get("#favorites-list").innerHTML.includes("测试馆"));
  assert.match(f.ids.get("#favorites-list").innerHTML, /笔记/);
});
test("餐饮与博物馆时长分离；档案浏览使用冻结版本并可下载分享", () => {
  const f = fixture();
  assert.match(f.run('durationOptions(60,"food")'), /value="60" selected/);
  assert.ok(!f.run('durationOptions(60,"food")').includes("深度参观"));
  assert.match(f.run('durationOptions(240,"museum")'), /基本参观/);
  f.run(
    'boot.roadbooks=[{id:"book",trip_id:"t1",version:1,snapshot:{title:"旧路书",revision:2,selections:[],stops:[{id:"a",name:"旧馆名",day:1,minutes:240}]}}];trip={id:"t2",title:"另一旅行",stops:[],selections:[]};openRoadbook("book")',
  );
  const content = f.ids.get("#detail-content").innerHTML;
  assert.match(content, /旧馆名/);
  assert.ok(!content.includes("另一旅行"));
  assert.match(content, /data-archive-download="book"/);
  assert.match(content, /data-format="html"/);
  assert.equal(f.ids.get("#detail").open, true);
});

test("加入清单再次点击移除；暂存和连续点击均按最新状态切换", async () => {
  const staged = fixture();
  staged.run('tab="favorites";boot.venues=[{id:"a",name:"测试馆"}]');
  await staged.run('add("a")');
  assert.equal(
    JSON.parse(staged.storage.get("find-museum-unassigned")).length,
    1,
  );
  await staged.run('add("a")');
  assert.equal(staged.storage.has("find-museum-unassigned"), false);
  assert.equal(staged.ids.get("#discovery-design").disabled, true);
  let calls = 0,
    current = {
      id: "t1",
      revision: 1,
      selections: [],
      stops: [],
      settings: {},
    };
  const f = fixture({
    fetch: async (url, options) => {
      assert.match(url, /selection$/);
      const p = JSON.parse(options.body);
      assert.equal(p.inputRevision, current.revision);
      calls++;
      current = {
        ...current,
        revision: current.revision + 1,
        selections: p.ids,
      };
      return { ok: true, json: async () => ({ trip: current }) };
    },
  });
  f.run(
    'tab="favorites";boot.venues=[{id:"a",name:"测试馆"}];trip={id:"t1",revision:1,selections:[],stops:[],settings:{}}',
  );
  await f.run('Promise.all([add("a"),add("a")])');
  assert.equal(calls, 2);
  assert.deepEqual(current.selections, []);
  assert.equal(current.revision, 3);
});

test("高德馆址匹配容忍空数组/数字/对象typecode；仅有效博物馆显示，不使整批失败", async () => {
  const f = fixture({
    fetch: async () => ({
      ok: true,
      json: async () => ({
        pois: [
          null,
          { name: "空数组", typecode: [] },
          { name: "数字", typecode: 140100 },
          { name: "对象", typecode: {} },
          { name: "缺少类别" },
          { id: "POI001", name: "测试博物馆", typecode: "140100" },
          { id: "POI002", name: "停车场", typecode: "140100" },
        ],
      }),
    }),
  });
  await f.run('searchOnline("测试")');
  const content = f.ids.get("#action-content").innerHTML;
  assert.match(content, /测试博物馆/);
  assert.ok(!content.includes("选择空数组"));
  assert.ok(!content.includes("选择停车场"));
  assert.equal(f.ids.get("#action-dialog").open, true);
});

test("宋韵与经典切换保留旅行与档案，筛选分区且只有一个空状态", () => {
  const f = fixture();
  assert.equal(f.run("document.body.dataset.theme"), "song");
  f.run(
    'trip={id:"keep",selections:[],stops:[],settings:{}};applyAppearance("classic")',
  );
  assert.equal(f.run("document.body.dataset.theme"), "classic");
  assert.equal(f.run("trip.id"), "keep");
  assert.equal(f.storage.get("find-museum.appearance"), "classic");
  f.run('showTab("results")');
  assert.equal(f.ids.get("#results-list").innerHTML, "");
  assert.match(f.ids.get("#roadbook-list").innerHTML, /去设计路书/);
  assert.equal(f.ids.get(".workflow-steps").hidden, true);
});

test("打开旅行时标题更新为当前目的地，保留当前Tab", async () => {
  const f = fixture({fetch:async()=>({ok:true,json:async()=>({trip:{id:"city",selections:[],stops:[],settings:{destination:"三门峡",center:{longitude:111.2,latitude:34.8,crs:"GCJ-02"}}}})})});
  await f.run('openTrip("city",false)');
  assert.equal(f.ids.get("#page-title").textContent,"三门峡，馆里见。");
  f.run('tab="results"');
  await f.run('openTrip("city",false)');
  assert.equal(f.ids.get("#page-title").textContent,"路书浏览");
});

test("导航为发现→设计→浏览→收藏；收藏精简且与当前路书选择联动",()=>{
 const html=readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
 assert.deepEqual([...html.matchAll(/data-tab="([^"]+)"/g)].map(m=>m[1]),["discover","route","results","favorites","data"]);
 const f=fixture();
 f.run('trip={id:"t",title:"春游",selections:[],stops:[],settings:{}};boot.venues=[{id:"v",name:"测试馆",kind:"museum"}];boot.favorites=[{id:"v",visited:false,note:"保留笔记"}];renderFavorites()');
 assert.match(f.ids.get("#favorites-list").innerHTML,/添加到路书/);
 assert.match(f.ids.get("#favorites-list").innerHTML,/保留笔记/);
 f.run('trip.selections=["v"];renderFavorites()');
 assert.match(f.ids.get("#favorites-list").innerHTML,/已加入 · 移出/);
 assert.match(f.ids.get("#favorites-trip-context").textContent,/春游 · 已选 1 处/);
});
