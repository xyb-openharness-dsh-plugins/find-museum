import { distanceKm, withinRadius, moveStop } from "./route.mjs";
import {
  placeKinds,
  roadbookText,
  publicSnapshot,
  personalizedHtmlPrompt,
} from "./roadbook.mjs";
import { attachAmap } from "./map.mjs";
const $ = (s) => document.querySelector(s),
  esc = (v) =>
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
let boot = {
    venues: [],
    trips: [],
    favorites: [],
    artifacts: [],
    roadbooks: [],
    settings: {},
    candidates: [],
    configured: false,
  },
  trip = null,
  tab = "discover",
  filter = "all",
  page = 1,
  total = 0,
  searchToken = 0,
  center = { longitude: 120.627856, latitude: 31.322948, crs: "GCJ-02" },
  centerName = "苏州博物馆本馆",
  sessionId = null,
  pendingWrites = Promise.resolve(),
  map,
  mapLayer,
  routeLine,
  mapDetach;
const isEmbedded = parent !== window,
  requests = new Map(),
  lastTripKey = "find-museum.last-trip.v1",
  rootKey = "find-museum.confirmed-root.v1";
function toast(t) {
  $("#toast").textContent = t;
  $("#toast").classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $("#toast").classList.remove("show"), 4500);
}
async function api(path, options = {}) {
  const r = await fetch("/api/find-museum" + path, {
    credentials: "same-origin",
    ...options,
    headers: { "content-type": "application/json", ...options.headers },
  });
  const j = await r.json();
  if (!r.ok) {
    const e = new Error(j.error || `HTTP ${r.status}`);
    e.code = j.code;
    throw e;
  }
  return j;
}
function bridge(type, payload = {}) {
  if (!isEmbedded)
    return Promise.reject(
      new Error("当前是独立预览，请在DSH工作台中使用原生会话"),
    );
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      requests.delete(requestId);
      reject(new Error("Desktop响应超时，请重试；未自动发送消息"));
    }, 45000);
    requests.set(requestId, { resolve, reject, timer });
    parent.postMessage(
      { channel: "find-museum-business", type, requestId, ...payload },
      location.origin,
    );
  });
}
window.addEventListener("message", (e) => {
  if (
    e.source !== parent ||
    e.origin !== location.origin ||
    e.data?.channel !== "find-museum-host"
  )
    return;
  const d = e.data;
  if (d.type === "reply") {
    const r = requests.get(d.requestId);
    if (r) {
      clearTimeout(r.timer);
      requests.delete(d.requestId);
      d.ok ? r.resolve(d.result) : r.reject(new Error(d.error));
    }
  }
  if (d.type === "context") {
    sessionId = d.sessionId;
    if (d.notice) $("#save-state").textContent = d.notice;
    if (
      d.tripId &&
      boot.configured &&
      d.tripId !== trip?.id &&
      boot.trips.some((t) => t.id === d.tripId)
    )
      void openTrip(d.tripId, false);
  }
});
const safe =
  (fn) =>
  async (...args) => {
    try {
      await fn(...args);
    } catch (e) {
      toast(e.message);
      $("#save-state").textContent =
        e.code === "REVISION_CONFLICT"
          ? "有较新版本，请重新选择当前旅行后再编辑"
          : "操作未完成";
    }
  };
function dialog(title, content, onSubmit) {
  $("#action-content").innerHTML =
    `<div class="dialog-head"><h2>${esc(title)}</h2><button type="button" class="quiet" data-close="action-dialog">关闭 ×</button></div><form class="action-form" id="action-form">${content}</form>`;
  $("#action-dialog").showModal();
  $("#action-form").onsubmit = safe(async (e) => {
    e.preventDefault();
    const form = e.currentTarget,
      submit = form.querySelector("button[type=submit]");
    if (submit) submit.disabled = true;
    try {
      await onSubmit(new FormData(form));
      $("#action-dialog").close();
    } finally {
      if (submit) submit.disabled = false;
    }
  });
}
async function chooseFolder(type) {
  if (isEmbedded) return (await bridge(type)).path;
  return new Promise((resolve) => {
    const sheet = document.createElement("dialog");
    sheet.innerHTML =
      '<div class="dialog-head"><h2>本机开发预览：指定现有目录</h2><button type="button" class="quiet">取消 ×</button></div><form class="action-form"><p class="soft-note">正式DSH版使用系统目录选择器；此处仅供本机开发。</p><label>现有目录绝对路径<input name="folder" required placeholder="选择一个专用测试目录"></label><button type="submit" class="primary">使用此目录</button></form>';
    let result = null;
    sheet.querySelector("button[type=button]").onclick = () => sheet.close();
    sheet.querySelector("form").onsubmit = (e) => {
      e.preventDefault();
      result = new FormData(e.currentTarget).get("folder").trim();
      sheet.close();
    };
    sheet.addEventListener(
      "close",
      () => {
        sheet.remove();
        resolve(result);
      },
      { once: true },
    );
    document.body.appendChild(sheet);
    sheet.showModal();
  });
}
async function configureRoot() {
  const path = await chooseFolder("choose-root");
  if (!path) {
    toast("已取消，未创建目录或旅行");
    return;
  }
  await api("/configure", {
    method: "POST",
    body: JSON.stringify({ dataRoot: path }),
  });
  localStorage.setItem(rootKey, path);
  trip = null;
  localStorage.removeItem(lastTripKey);
  await reload();
  if (isEmbedded) await bridge("root-changed", { bindings: boot.bindings });
  toast("资料目录已连接，原目录数据保留");
}
async function reload() {
  boot = await api("/bootstrap");
  $("#version").textContent = "v" + boot.version;
  $("#root-description").textContent = boot.configured
    ? "资料目录：" + boot.dataRoot
    : "尚未选择资料目录，可先检索；保存旅行时需选择。";
  $("#choose-root").textContent = boot.configured
    ? "切换资料目录"
    : "选择资料目录";
  const museums = boot.venues.filter(
    (v) =>
      (!v.kind || v.kind === "museum") &&
      Number.isFinite(v.latitude) &&
      Number.isFinite(v.longitude),
  );
  $("#coverage").textContent =
    `已定位 ${museums.length} 处馆址 · 开放状态需按日期核实`;
  $("#located-count").textContent = museums.length;
  $("#venue-total").textContent =
    `${museums.length} 个馆址，${new Set(museums.map((v) => v.museumId || v.id)).size} 个机构；另有 ${boot.venues.length - museums.length} 处旅行地点`;
  $("#map-config-status").textContent = boot.settings.amapConfigured
    ? "已配置 · 不回显"
    : "未配置，地图暂不可用";
  renderProjects();
  if (trip && boot.trips.some((t) => t.id === trip.id))
    trip = (await api("/trip?id=" + encodeURIComponent(trip.id))).trip;
  refresh();
}
function renderProjects() {
  $("#project-select").innerHTML =
    '<option value="">选择旅行项目</option>' +
    boot.trips
      .map(
        (t) =>
          `<option value="${esc(t.id)}" ${trip?.id === t.id ? "selected" : ""}>${esc(t.title)}</option>`,
      )
      .join("");
}
async function openTrip(id, notify = true) {
  await pendingWrites;
  const t = id ? (await api("/trip?id=" + encodeURIComponent(id))).trip : null;
  trip = t;
  $("#driving-results").textContent = "";
  try {
    if (t) localStorage.setItem(lastTripKey, t.id);
    else localStorage.removeItem(lastTripKey);
  } catch {}
  if (t) {
    if (t.settings.center) {
      center = t.settings.center;
      centerName = t.settings.destination || "旅行中心";
    }
    $("#city").value = t.settings.destination || "苏州";
  }
  renderProjects();
  showTab(tab);
  if (notify && isEmbedded) await bridge("select-trip", { tripId: id || null });
}
function needTrip() {
  if (!trip) throw new Error("请先新建或选择旅行，修改将保存到该旅行。");
  return trip;
}
function mutate(update) {
  const id = needTrip().id;
  const run = pendingWrites.then(async () => {
    if (trip?.id !== id) throw new Error("旅行已切换，未执行旧页面操作");
    const next = structuredClone(trip);
    update(next);
    $("#save-state").textContent = "正在保存…";
    const r = await api("/trip", {
      method: "PUT",
      body: JSON.stringify({ ...next, revision: trip.revision }),
    });
    if (trip?.id === id) {
      trip = r.trip;
      boot.trips = boot.trips.map(t => t.id === trip.id ? trip : t);
      renderProjects();
      $("#driving-results").textContent = "计划已更新，请重新核算驾车路段。";
      $("#save-state").textContent = r.warning || "已保存到本机";
      refresh();
    }
    return r.trip;
  });
  pendingWrites = run.catch(() => {});
  return run;
}
function newTrip() {
  dialog(
    "新建一次寻馆旅行",
    '<label>旅行名称<input name="title" required maxlength="160" value="' +
      esc($("#city").value || "城市") +
      '寻馆"></label><label>出行日期<input name="date" type="date"></label><p class="micro">下一步由系统选择保存目录；取消不会创建旅行。创建成功后尝试打开原生会话，开场白由你确认发送。</p><button type="submit" class="primary">选择目录并创建</button>',
    async (f) => {
      const title = String(f.get("title")),
        date = String(f.get("date") || "");
      $("#action-dialog").close();
      const folder = await chooseFolder("choose-folder");
      if (!folder) {
        toast("已取消，未创建旅行");
        return;
      }
      if (!boot.configured) {
        await api("/configure", {
          method: "POST",
          body: JSON.stringify({ dataRoot: folder }),
        });
        localStorage.setItem(rootKey, folder);
      }
      const r = await api("/trips", {
        method: "POST",
        body: JSON.stringify({
          title,
          folder,
          settings: {
            destination: $("#city").value,
            date,
            mode: "尚未决定",
            center: centerName.includes($("#city").value.replace(/市$/, ""))
              ? center
              : null,
          },
        }),
      });
      await reload();
      trip = r.trip;
      localStorage.setItem(lastTripKey, trip.id);
      renderProjects();
      await commitDraftSelection();
      showTab("route");
      if (isEmbedded)
        await bridge("trip-created", {
          tripId: trip.id,
          folder: r.folder,
          prompt: prompt(
            "请先了解这次旅行的兴趣与时间安排，再推荐大馆和周边特色县域馆。",
          ),
        });
      toast("旅行已创建并保存");
    },
  );
}
let draftSelection = [];
try {
  const staged = JSON.parse(
    localStorage.getItem("find-museum-unassigned") || "[]",
  );
  if (Array.isArray(staged))
    draftSelection = staged
      .filter((v) => v && typeof v.id === "string")
      .slice(0, 100);
} catch {}
function stagePlaces(rows) {
  draftSelection = [
    ...new Map([...draftSelection, ...rows].map((v) => [v.id, v])).values(),
  ];
  localStorage.setItem(
    "find-museum-unassigned",
    JSON.stringify(draftSelection),
  );
  refresh();
  toast("已暂存清单；下一步选择或新建旅行后保存");
}
async function commitDraftSelection() {
  if (!draftSelection.length) return;
  const t = needTrip();
  for (let offset = 0; offset < draftSelection.length; offset += 30) {
    if (trip?.id !== t.id) throw new Error("旅行已切换，暂存清单仍保留");
    const r = await api("/selection-import", {
      method: "POST",
      body: JSON.stringify({
        tripId: t.id,
        inputRevision: trip.revision,
        venues: draftSelection.slice(offset, offset + 30),
      }),
    });
    if (trip?.id !== t.id) throw new Error("旅行已切换，暂存清单仍保留");
    trip = r.trip;
    boot.venues = r.venues;
    boot.candidates = r.candidates;
  }
  draftSelection = [];
  localStorage.removeItem("find-museum-unassigned");
  refresh();
}
function collectedVenues() {
  return (trip?.selections || [])
    .map((id) => boot.venues.find((v) => v.id === id))
    .filter(Boolean);
}
function selectedVenues() {
  return (trip?.stops || []).map((s) => ({
    ...boot.venues.find((v) => v.id === s.id),
    ...s,
  }));
}
function located() {
  const q = $("#query").value.trim(),
    grade = $("#grade").value,
    radius = Number($("#radius").value);
  return withinRadius(
    boot.venues.filter((v) => !v.kind || v.kind === "museum"),
    center,
    radius,
  ).located.filter(
    (v) =>
      (!q || [v.name, v.intro, ...(v.themes || [])].join(" ").includes(q)) &&
      (!grade || v.grade === grade) &&
      (filter !== "county" || v.county) &&
      (filter !== "theme" ||
        v.label === "特色专题" ||
        v.themes?.some((t) => /工艺|考古|艺术/.test(t))),
  );
}
function card(v) {
  const selected =
      trip?.selections?.includes(v.id) ||
      draftSelection.some((x) => x.id === v.id),
    fav = boot.favorites.some((f) => f.id === v.id);
  let distance = "待定位";
  try {
    distance = distanceKm(center, v).toFixed(1) + " km · 直线";
  } catch {}
  return `<article class="museum-card"><div class="card-top"><span class="category ${v.county ? "county" : ""}">${esc(placeKinds[v.kind] || v.label || "博物馆")}</span><span class="distance">${distance}</span></div><h3><button class="card-detail" data-detail="${esc(v.id)}">${esc(v.name)}</button></h3><p>${esc(v.intro || "特色介绍待核实，可交给 Agent 补充。")} ${v.rating ? `<small>高德评分 ${esc(v.rating.value)}${v.rating.scale ? " / " + esc(v.rating.scale) : "（原始值）"}</small>` : ""}</p><div class="card-tags">${(v.themes || []).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}<span class="tag pending">${status(v)}</span></div><div class="card-actions"><button class="outline" data-add="${esc(v.id)}" aria-pressed="${!!selected}" title="${selected ? "再次点击移出本次清单" : "加入本次清单"}">${selected ? "✓ 已加入清单" : "+ 加入清单"}</button><button class="quiet" data-favorite="${esc(v.id)}" aria-label="${fav ? "取消收藏" : "收藏"}${esc(v.name)}">${fav ? "♥" : "♡"}</button><span class="grade-note">${v.grade ? "机构" + esc(v.grade) + " · " + esc(v.gradeAsOf || "年份待核实") : "等级待核实"}</span></div></article>`;
}
function status(v) {
  if (
    !v.validFrom ||
    !v.validTo ||
    !trip?.settings.date ||
    trip.settings.date < v.validFrom ||
    trip.settings.date > v.validTo
  )
    return "出行日开放待核实";
  return (
    {
      open: "来源记录：开放",
      closed: "来源记录：闭馆",
      partial: "部分展厅关闭",
      seasonal: "季节性安排",
      unknown: "开放待核实",
    }[v.openingStatus] || "开放待核实"
  );
}
function renderDiscovery() {
  const list = located();
  $("#list-heading").textContent = "已定位的馆";
  $("#result-count").textContent = list.length + " 处馆址";
  $("#scope-note").textContent = "以" + centerName + "为中心 · 直线距离";
  $("#center-label").textContent = centerName;
  $("#museum-list").innerHTML =
    list.map(card).join("") ||
    '<div class="empty">本地暂无匹配馆址。可以高德搜馆，或请Agent补全历史名录的地址。</div>';
  renderMap(list);
  void searchCatalog();
}
async function searchCatalog() {
  const ticket = ++searchToken;
  const params = new URLSearchParams({
    q: $("#query").value.trim(),
    city: $("#city").value.trim(),
    grade: $("#grade").value,
    county: String(filter === "county"),
    page: String(page),
  });
  try {
    const r = await api("/catalog?" + params);
    if (ticket !== searchToken) return;
    total = r.total;
    $("#catalog-list").innerHTML =
      r.rows
        .map(
          (v) =>
            `<article class="catalog-item"><b>${esc(v.name)}</b><small>${esc(v.province)} · ${esc(v.grade)} / 2019 · ${esc(v.city_candidate || "城市待核实")}${v.city_match_method ? "（名称候选）" : ""}</small><button class="outline" data-match="${esc(v.museum_id)}" data-name="${esc(v.name)}">高德匹配馆址</button><button class="quiet" data-ask-name="${esc(v.name)}">请 Agent 核实 ↗</button></article>`,
        )
        .join("") ||
      '<p class="micro">名录没有匹配；可清空城市搜索全国，或查询名录之后的新馆。</p>';
    $("#catalog-page").textContent =
      `${page} / ${Math.max(1, Math.ceil(total / 40))} · ${total}条`;
    $("#prev-page").disabled = page <= 1;
    $("#next-page").disabled = page * 40 >= total;
  } catch (e) {
    if (ticket === searchToken) $("#catalog-list").textContent = e.message;
  }
}
function initMap() {
  map = L.map("map", {
    zoomControl: true,
    scrollWheelZoom: false,
    minZoom: 3,
    maxZoom: 17,
  }).setView([center.latitude, center.longitude], 10);
  mapLayer = L.layerGroup().addTo(map);
  const warning = document.createElement("div");
  warning.className = "map-error";
  warning.hidden = true;
  $("#map").appendChild(warning);
  mapDetach = attachAmap(map, L, {
    onError: (message) => {
      warning.textContent = message;
      warning.hidden = !message;
    },
  });
  L.control.scale({ imperial: false }).addTo(map);
  map.on(
    "contextmenu",
    safe(async (e) => {
      center = {
        longitude: e.latlng.lng,
        latitude: e.latlng.lat,
        crs: "GCJ-02",
      };
      centerName = "地图选择点";
      if (trip)
        await mutate((t) => {
          t.settings.center = center;
        });
      renderDiscovery();
      toast("已设为100km检索中心");
    }),
  );
}
function renderMap(list) {
  if (!map) return;
  mapLayer.clearLayers();
  list
    .filter((v) => Number.isFinite(v.latitude) && Number.isFinite(v.longitude))
    .forEach((v) => {
      const i = trip?.stops.findIndex((s) => s.id === v.id) ?? -1;
      L.marker([v.latitude, v.longitude], {
        title: v.name,
        icon: L.divIcon({
          className: "",
          html: `<div class="pin ${v.county ? "small-museum" : ""}">${i >= 0 ? i + 1 : "·"}</div>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        }),
      })
        .addTo(mapLayer)
        .bindTooltip(esc(v.name))
        .on("click", () => detail(v.id));
    });
  if (routeLine) map.removeLayer(routeLine);
  const rows = selectedVenues().filter(
    (v) => Number.isFinite(v.latitude) && Number.isFinite(v.longitude),
  );
  if (rows.length > 1)
    routeLine = L.polyline(
      rows.map((v) => [v.latitude, v.longitude]),
      { color: "#b65332", weight: 2, dashArray: "5 7" },
    ).addTo(map);
}
function showTab(t) {
  tab = t;
  document.body.dataset.page = t;
  $(".workflow-help-row").hidden = !["discover", "route"].includes(t);
  $("#mobile-page").value = t;
  $(".searchbar").hidden = t !== "discover";
  $("#discovery-next").hidden = t !== "discover";
  document
    .querySelectorAll("[data-tab]")
    .forEach((b) =>
      b.setAttribute("aria-current", b.dataset.tab === t ? "page" : "false"),
    );
  document
    .querySelectorAll(".page")
    .forEach((p) => (p.hidden = p.id !== t + "-page"));
  document
    .querySelectorAll("[data-tab]")
    .forEach((b) => b.classList.toggle("active", b.dataset.tab === t));
  $("#page-title").textContent =
    t === "discover"
      ? ($("#city").value || "目的地") + "，馆里见。"
      : {
          route: "设计路书",
          favorites: "我的收藏",
          results: "路书浏览",
          data: "数据配置",
        }[t];
  $(".intro-note").textContent = {
    discover: "先选馆，再把喜欢的地方串成路书。",
    route: "先安排 Day N，再留出交通与休息的余地。",
    favorites: "收藏喜欢的地方，再选入这一次路书。",
    results: "按版本回顾行程，也可交给 Agent 继续完善。",
    data: "连接状态一目了然，详细配置按需展开。",
  }[t];
  refresh();
  if (t === "discover") requestAnimationFrame(() => map?.invalidateSize());
}
function refresh() {
  const selectedCount = (trip?.selections?.length || 0) + draftSelection.length;
  $("#discovery-selection").textContent = selectedCount
    ? `本次已选 ${selectedCount} 处${draftSelection.length ? " · 部分尚未保存到旅行" : ""}`
    : "先选几处感兴趣的馆";
  $("#discovery-design").disabled = !selectedCount;
  $("#map-summary").textContent = boot.settings.amapConfigured
    ? "已配置"
    : "未配置";
  if (!boot.settings.amapConfigured) $("#map-settings").open = true;
  $("#route-count").textContent = trip?.selections?.length || 0;
  if (tab === "discover") renderDiscovery();
  if (tab === "route") renderRoute();
  if (tab === "favorites") renderFavorites();
  if (tab === "results") renderResults();
  $("#project-select").value = trip?.id || "";
}
function renderRoute() {
  const rr = selectedVenues();
  $("#selection-list").innerHTML =
    collectedVenues()
      .map(
        (v, i) =>
          `<article class="collection-row"><span>${i + 1}</span><div><b>${esc(v.name)}</b><small>${esc(v.address)}</small></div><button class="quiet" data-detail="${esc(v.id)}">详情</button><button class="quiet" data-uncollect="${esc(v.id)}" aria-label="移出清单${esc(v.name)}">移出</button></article>`,
      )
      .join("") ||
    '<div class="empty">第一步只收集想去的馆，不限制时长、天数或顺序。去发现页面搜索并加入清单。</div>';
  $("#selection-total").textContent =
    (trip?.selections?.length || 0) + "处已收集 · " + rr.length + "处已编排";
  $("#trip-title").value = trip?.title || "";
  $("#trip-date").value = trip?.settings.date || "";
  $("#trip-mode").value = trip?.settings.mode || "尚未决定";
  $("#route-list").innerHTML =
    rr
      .map(
        (v, i) =>
          `<article class="route-row"><span class="stop-number">${i + 1}</span><div class="route-main"><h3><button class="card-detail" data-detail="${esc(v.id)}">${esc(v.name)}</button></h3><p>${esc(v.district || v.city)} · ${status(v)}</p><div class="route-options"><label>第 <select data-day="${esc(v.id)}">${Array.from(
            { length: 30 },
            (_, i) => i + 1,
          )
            .map(
              (d) =>
                `<option value="${d}" ${d === v.day ? "selected" : ""}>${d}</option>`,
            )
            .join(
              "",
            )}</select> 天</label><label>参观 <select data-minutes="${esc(v.id)}">${durationOptions(v.minutes, v.kind)}</select></label></div></div><div class="stop-controls"><button class="quiet" data-move="${esc(v.id)}" data-delta="-1" aria-label="上移${esc(v.name)}" ${i === 0 ? "disabled" : ""}>↑</button><button class="quiet" data-move="${esc(v.id)}" data-delta="1" aria-label="下移${esc(v.name)}" ${i === rr.length - 1 ? "disabled" : ""}>↓</button><button class="quiet" data-remove="${esc(v.id)}" aria-label="移除${esc(v.name)}">×</button></div></article>`,
      )
      .join("") ||
    '<div class="empty">清单与路线分开保存；收集好后点击“开始排序 / 调整 Day N”。</div>';
  let km = 0;
  for (let i = 1; i < rr.length; i++)
    if (rr[i].day === rr[i - 1].day) {
      try {
        km += distanceKm(rr[i - 1], rr[i]);
      } catch {}
    }
  $("#distance-total").textContent =
    `${rr.length}处地点 · 同日相邻直线合计${km.toFixed(1)}km（非路程）`;
}
function renderFavorites() {
  const selection = trip?.selections || draftSelection.map(v => v.id);
  $("#favorites-trip-context").textContent = trip
    ? `当前路书：${trip.title} · 已选 ${selection.length} 处。加入后到「设计路书」排序。`
    : "尚未选择旅行；可以先暂存地点，再去设计路书保存。";
  $("#favorites-list").innerHTML = boot.favorites
    .filter(f => !$("#favorite-status").value || (f.visited ? "visited" : "wish") === $("#favorite-status").value)
    .filter(f => !$("#favorite-kind").value || (boot.venues.find(v => v.id === f.id)?.kind || "museum") === $("#favorite-kind").value)
    .map(f => {
      const v = boot.venues.find(v => v.id === f.id);
      if (!v) return "";
      const selected = selection.includes(v.id);
      return `<article class="favorite-card"><div class="favorite-main"><div><span class="tag">${esc(placeKinds[v.kind || "museum"])}</span><span class="favorite-status">${f.visited ? "去过" : "想去"}</span><h3><button class="card-detail" data-detail="${esc(v.id)}">${esc(v.name)}</button></h3><p class="micro">${esc(v.city || v.address || "地点待补充")}</p></div><div class="favorite-actions"><button class="${selected ? "outline" : "primary"}" data-add="${esc(v.id)}" aria-pressed="${selected}" title="${selected ? "再次点击从当前路书移出，保留收藏" : "添加到当前路书清单"}">${selected ? "✓ 已加入 · 移出" : "+ 添加到路书"}</button><button class="quiet" data-favorite="${esc(v.id)}" aria-label="取消收藏${esc(v.name)}">♥</button></div></div><details class="favorite-extra"><summary>参访记录${f.note ? " · 有笔记" : "与笔记"}</summary><label><input type="checkbox" data-visited="${esc(v.id)}" ${f.visited ? "checked" : ""}> 已到访</label><textarea class="favorite-note" data-note="${esc(v.id)}" aria-label="${esc(v.name)}笔记" placeholder="记下感兴趣的展品或参观感受">${esc(f.note || "")}</textarea></details></article>`;
    }).join("") || '<div class="empty"><p>把喜欢的地方收藏在这里，随时选入路书。</p><button class="outline" data-go="discover">去发现博物馆 →</button></div>';
}

function renderResults() {
  renderRoadbookList();
  $("#candidate-list").innerHTML = boot.candidates
    .filter((x) => x.status === "pending" && (!trip || x.trip_id === trip.id))
    .map(
      (c) =>
        `<article class="candidate"><b>待确认 · ${esc(c.payload.name)}</b><small>${esc(boot.trips.find((t) => t.id === c.trip_id)?.title || c.trip_id)} · ${esc(c.status)}</small><p>${esc(c.payload.address)}<br>${esc(c.payload.longitude)},${esc(c.payload.latitude)} (${esc(c.payload.crs)})<br>开放状态：${esc(c.payload.openingStatus)} · <a href="${esc(c.payload.sourceUrl)}" target="_blank" rel="noopener noreferrer">查看来源</a></p><p>来自旅行revision ${c.payload.inputRevision}；确认后加入本地馆址。请检查是否匹配了正确的馆，而非停车场。</p><button class="outline" data-review="${esc(c.id)}" data-accept="true">确认加入</button><button class="quiet" data-review="${esc(c.id)}" data-accept="false">拒绝</button></article>`,
    )
    .join("");
  $("#results-list").innerHTML =
    boot.artifacts
      .filter(
        (a) =>
          !a.payload.roadbookId &&
          ($("#archive-scope").value === "all" || a.trip_id === trip?.id),
      )
      .map(
        (a) =>
          `<article class="artifact-row"><b>${esc(a.payload.title || a.kind)}</b><small>${esc(a.created_at)} · ${esc(a.payload.format)} · 输入revision ${a.payload.revision}</small><button class="outline" data-artifact-preview="${esc(a.id)}">浏览内容</button><a href="/api/find-museum/file?id=${encodeURIComponent(a.id)}" download>下载文件 →</a><details><summary>文件与来源</summary><small>SHA-256：${esc(a.payload.sha256)}</small></details></article>`,
      )
      .join("") || "";
}
async function detail(id) {
  const v = boot.venues.find((x) => x.id === id);
  if (!v) return;
  $("#detail-content").innerHTML =
    `<div class="dialog-head"><div><p class="eyebrow">${esc(v.label || "馆址")} · ${esc(v.district || "")}</p><h2>${esc(v.name)}</h2></div><button class="quiet" data-close="detail">关闭 ×</button></div><div class="detail-section"><h3>特色与展品</h3><p>${esc(v.intro || "介绍待核实")}</p><p>${esc(v.featuredExhibits || "具体在展展品待核实")}</p>${v.introSource ? `<a href="${esc(v.introSource)}" target="_blank" rel="noopener noreferrer">介绍来源 ↗</a>` : ""}</div><div class="detail-section"><h3>位置</h3><p>${esc(v.address)}<br>${v.unlocated ? "尚未定位，不参加地图或距离计算" : esc(v.longitude) + ", " + esc(v.latitude) + " · " + esc(v.crs)}</p><a href="${esc(v.sourceUrl)}" target="_blank" rel="noopener noreferrer">位置来源 ↗</a><button class="quiet" data-center="${esc(v.id)}" ${v.unlocated ? "disabled" : ""}>以此地点为周边中心</button></div><div class="detail-section"><h3>常规时间与临时状态</h3><p>${esc(v.openingHours || "未知")}</p><p class="soft-note">${status(v)}；核实日：${esc(v.checkedAt || "未记录")}；有效期：${esc(v.validFrom || "未确认")} 至 ${esc(v.validTo || "未确认")}</p></div><div class="detail-section"><h3>官网与公众号</h3>${v.officialUrl ? `<a href="${esc(v.officialUrl)}" target="_blank" rel="noopener noreferrer">官网/主管部门 ↗</a>` : "<p>官网待核实</p>"}<p>${esc(v.wechatName || "公众号账号待核实")}</p>${v.wechatUrl ? `<a href="${esc(v.wechatUrl)}" target="_blank" rel="noopener noreferrer">公众号来源 ↗</a>` : ""}</div><div class="card-actions"><button class="primary" data-add="${esc(v.id)}" aria-pressed="${!!(trip?.selections?.includes(v.id) || draftSelection.some((x) => x.id === v.id))}">${trip?.selections?.includes(v.id) || draftSelection.some((x) => x.id === v.id) ? "✓ 已加入 · 点击移出" : "加入本次清单"}</button><button class="outline" data-advice="${esc(v.id)}">请 Agent 核实</button></div>`;
  $("#detail").showModal();
}
function prompt(extra = "") {
  const t = needTrip();
  return [
    `请使用博物馆路线规划技能协助我。`,
    `旅行：${t.title}；tripId：${t.id}；inputRevision：${t.revision}`,
    `工作区：${t.settings.folder}；先读CONTEXT.md。`,
    `目的地：${t.settings.destination || $("#city").value}；日期：${t.settings.date || "待定"}；交通：${t.settings.mode}`,
    "按Day N规划，不需要出发时刻。餐饮/景点/Citywalk按各自类型分配合理停留时间。每馆4小时基本参观，6–8小时深度参观，不安排1–2小时打卡。以下顺序由用户安排，优化先提建议，不直接覆盖。",
    ...(trip.stops.length ? selectedVenues() : collectedVenues()).map(
      (v, i) =>
        `${i + 1}. ${v.day ? "Day " + v.day : "待编排"} ${v.name}；馆址ID=${v.id}；机构ID=${v.museumId}；${v.address}；坐标${v.longitude},${v.latitude}（${v.crs}）；${v.minutes ? "计划" + v.minutes + "分钟" : "尚未安排时长"}；来源${v.sourceUrl}`,
    ),
    "请核实出行日开放公告、维修/展厅关闭、预约与最后入馆；查询交通并补充路书和周边特色县域馆。",
    "2019等级是历史字段，100km是直线半径。馆藏不保证在展；公众号不可访问时不要编内容。每项结论保留来源URL、发布日期/有效期和检索日。",
    `结构化回写格式：{"schemaVersion":1,"tripId":"${t.id}","inputRevision":${t.revision},"venues":[{"id":"稳定ID","museumId":"机构ID","name":"名称","city":"城市","province":"省","district":"区县","address":"详细地址","longitude":120.0,"latitude":31.0,"crs":"GCJ-02","sourceUrl":"实际来源URL","openingStatus":"unknown","openingHours":"原文摘要","checkedAt":"核实日期","intro":"介绍","officialUrl":"官网","wechatName":"公众号名称","wechatUrl":"来源","featuredExhibits":"展品与在展状态"}]}`,
    "包内技能说明并不代表工具已注册；仅调用原生会话实际可用工具。馆方官网/文旅主管单位优先，搜索摘要仅是线索。公众号不可访问时保留未知。",
    "venues中的值必须来自核实结果，以上数字只是结构示例。非unknown状态必须有validFrom/validTo。结果先作为候选导入，由用户确认。路书放output；使用工作台“保存路书”登记到结果库，Agent直接写文件不会自动归档。不能直接改SQLite或把route.json快照当事实库。",
    extra,
  ]
    .filter(Boolean)
    .join("\n");
}
async function sendPrompt(extra = "") {
  await pendingWrites;
  const p = prompt(extra);
  if (isEmbedded) {
    await bridge("draft", { tripId: trip.id, prompt: p });
    toast("已追加原生草稿，请确认发送");
  } else
    dialog(
      "提示词预览（独立开发环境）",
      `<p class="soft-note">尚未连接DSH，不会自动发送。</p><textarea readonly>${esc(p)}</textarea><button type="submit" class="primary">关闭</button>`,
      async () => {},
    );
}
async function ensureSession() {
  const t = needTrip();
  await bridge("ensure-session", { tripId: t.id, folder: t.settings.folder });
}
function updateSelection(update) {
  const id = needTrip().id;
  const run = pendingWrites.then(async () => {
    if (trip?.id !== id) throw new Error("旅行已切换");
    const ids = update([...(trip.selections || [])]),
      r = await api("/selection", {
        method: "PUT",
        body: JSON.stringify({ tripId: id, inputRevision: trip.revision, ids }),
      });
    if (trip?.id === id) {
      trip = r.trip;
      $("#save-state").textContent = r.warning || "博物馆清单已保存";
      refresh();
    }
    return r.trip;
  });
  pendingWrites = run.catch(() => {});
  return run;
}
async function add(id) {
  const staged = draftSelection.some((v) => v.id === id);
  if (staged) {
    draftSelection = draftSelection.filter((v) => v.id !== id);
    if (draftSelection.length)
      localStorage.setItem(
        "find-museum-unassigned",
        JSON.stringify(draftSelection),
      );
    else localStorage.removeItem("find-museum-unassigned");
    if (!trip?.selections?.includes(id)) {
      refresh();
      toast("已移出暂存清单");
      if ($("#detail").open) await detail(id);
      return;
    }
  }
  if (!trip) {
    const v = boot.venues.find((v) => v.id === id);
    if (!v) throw new Error("地点不存在，请重新检索");
    stagePlaces([v]);
  } else {
    let removed = false;
    await updateSelection((ids) => {
      removed = ids.includes(id);
      return removed ? ids.filter((x) => x !== id) : [...ids, id];
    });
    toast(
      removed
        ? "已移出本次清单，关联的Day N编排同步移除"
        : "已加入清单；收集好后再排序安排",
    );
  }
  if ($("#detail").open) await detail(id);
}

async function favorite(id, patch) {
  if (!boot.configured) {
    toast("收藏前请先选择资料目录");
    return;
  }
  const old = boot.favorites.find((x) => x.id === id);
  const r = await api("/favorites", {
    method: patch || !old ? "PUT" : "DELETE",
    body: JSON.stringify({ id, ...(old || {}), ...(patch || {}) }),
  });
  boot.favorites = r.favorites;
  refresh();
}
function importCandidates() {
  const t = needTrip();
  dialog(
    "导入 Agent 核实结果",
    `<p class="micro">先进入候选库，确认后才更新馆址。输入revision必须匹配当前旅行 ${t.revision}。</p><label>JSON内容<textarea name="json" required placeholder='{"tripId":"${esc(t.id)}","inputRevision":${t.revision},"venues":[]}'></textarea></label><button type="submit" class="primary">校验并保存候选</button>`,
    async (f) => {
      const p = JSON.parse(String(f.get("json")));
      const r = await api("/candidates", {
        method: "POST",
        body: JSON.stringify(p),
      });
      boot.candidates = r.candidates;
      showTab("results");
      toast("候选已保存，请核对后确认");
    },
  );
}
function saveRoadbook() {
  const t = needTrip();
  dialog(
    "保存 Agent 路书",
    `<label>标题<input name="title" required value="${esc(t.title)} · 路书"></label><label>格式<select name="format"><option value="md">Markdown</option><option value="html">HTML</option><option value="txt">纯文本</option></select></label><label>路书内容<textarea name="content" required></textarea></label><button type="submit" class="primary">保存文件与回顾记录</button>`,
    async (f) => {
      const r = await api("/artifacts", {
        method: "POST",
        body: JSON.stringify({
          tripId: t.id,
          inputRevision: t.revision,
          title: f.get("title"),
          format: f.get("format"),
          content: f.get("content"),
        }),
      });
      boot.artifacts = r.artifacts;
      boot.roadbooks = r.roadbooks || boot.roadbooks;
      showTab("results");
      toast("路书已保存到旅行output目录");
    },
  );
}
async function exportTrip(format) {
  await pendingWrites;
  const t = needTrip(),
    r = await api("/export", {
      method: "POST",
      body: JSON.stringify({ tripId: t.id, revision: t.revision, format }),
    });
  boot.artifacts = r.artifacts;
  const a = document.createElement("a");
  a.href = r.downloadUrl;
  a.download = "";
  a.click();
  toast("真实文件已保存到output，并登记到路书浏览");
}
function durationOptions(minutes, kind = "museum") {
  return [
    ...new Set([
      ...(kind === "food"
        ? [30, 60, 90, 120]
        : kind === "citywalk"
          ? [30, 60, 120, 180]
          : kind === "attraction"
            ? [60, 120, 180, 240]
            : [240, 360, 480]),
      ...(minutes ? [minutes] : []),
    ]),
  ]
    .sort((a, b) => a - b)
    .map(
      (n) =>
        `<option value="${n}" ${n === minutes ? "selected" : ""}>${n % 60 === 0 ? n / 60 + "小时" : n + "分钟"}${kind === "museum" ? " · " + (n === 240 ? "基本参观" : "深度参观") : " · 规划停留"}</option>`,
    )
    .join("");
}
let searchSelection = "multi",
  planDraft = null,
  dragPlanId = null;
async function searchOnline(
  name = $("#query").value.trim() || "博物馆",
  museumId = "",
) {
  const result = await api("/amap", {
    method: "POST",
    body: JSON.stringify({
      action: "search",
      params: { keywords: name, city: $("#city").value },
    }),
  });
  const pois = (Array.isArray(result.pois) ? result.pois : []).filter(
    (p) =>
      p &&
      typeof p.name === "string" &&
      typeof p.typecode === "string" &&
      typeof p.id === "string" &&
      /^[\w]{5,40}$/.test(p.id) &&
      p.typecode.startsWith("1401") &&
      !/停车|入口|出口|展厅|办公室/.test(p.name),
  );
  searchSelection = "multi";
  dialog(
    "① 选择想去的博物馆",
    `<div class="selection-toolbar"><button type="button" class="outline" data-select-mode="single">单选</button><button type="button" class="outline" data-select-mode="multi" aria-pressed="true">多选</button><button type="button" class="quiet" data-select-all>一键全选</button><button type="button" class="quiet" data-select-clear>清空</button><span id="selection-count">已选0处</span></div><p class="micro">先加入博物馆清单，再单独排序和安排 Day N。高德POI可能包含商业展览空间，请核对馆方与官方名录；不据此确认开放。</p>` +
      pois
        .map(
          (p, i) =>
            `<label class="poi-option"><input type="checkbox" name="poi" value="${i}" aria-label="选择${esc(p.name)}"><span><strong>${esc(p.name)}</strong><small>${esc([p.pname, p.cityname, p.adname, typeof p.address === "string" ? p.address : ""].filter(Boolean).join(" "))}</small></span></label>`,
        )
        .join("") +
      (pois.length
        ? '<button type="submit" class="primary">加入博物馆清单</button>'
        : `<p>未找到可核实的标准博物馆POI。高德可能只返回地址线索，缺少POI ID或机构类别，不能据此确认馆址或当前开放。</p><button type="button" class="outline" data-ask-name="${esc(name)}">交给 Agent 继续核实 ↗</button>`),
    async (f) => {
      const selected = f.getAll("poi").map((i) => pois[Number(i)]);
      if (!selected.length) throw new Error("请至少选择一处馆址");
      const t = trip,
        tripId = t?.id,
        revision = t?.revision;
      const rows = [];
      for (const poi of selected) {
        const response = await api("/amap", {
            method: "POST",
            body: JSON.stringify({ action: "detail", params: { id: poi.id } }),
          }),
          v = response.pois?.[0];
        if (!v?.location) throw new Error(poi.name + "缺少坐标，请重新选择");
        const [longitude, latitude] = v.location.split(",").map(Number),
          old = boot.venues.find((x) => x.id === "amap-" + v.id);
        rows.push({
          ...old,
          id: "amap-" + v.id,
          museumId:
            (selected.length === 1 ? museumId : "") ||
            old?.museumId ||
            "amap-" + v.id,
          name: v.name,
          city: v.cityname || $("#city").value,
          province: v.pname || "",
          district: v.adname || "",
          address: [
            v.pname,
            v.cityname,
            v.adname,
            typeof v.address === "string" ? v.address : "",
          ]
            .filter(Boolean)
            .join(""),
          longitude,
          latitude,
          crs: "GCJ-02",
          sourceUrl:
            "https://uri.amap.com/marker?position=" +
            v.location +
            "&name=" +
            encodeURIComponent(v.name),
          openingStatus: "unknown",
          openingHours:
            v.business?.opentime_today ||
            v.business?.opentime_week ||
            old?.openingHours ||
            "",
          checkedAt: new Date().toISOString(),
          ...(old ? {} : { themes: [], intro: "", county: false }),
        });
      }
      if (!t) {
        stagePlaces(rows);
        return;
      }
      if (trip?.id !== tripId || trip.revision !== revision)
        throw new Error("旅行已变化，请重新检索和安排");
      const r = await api("/selection-import", {
        method: "POST",
        body: JSON.stringify({ tripId, inputRevision: revision, venues: rows }),
      });
      boot.venues = r.venues;
      boot.candidates = r.candidates;
      trip = r.trip;
      refresh();
      toast("已加入博物馆清单。可继续搜索，或到“设计路书”排序和安排Day N。");
    },
  );
}
function openPlanner(newVenues = []) {
  const t = needTrip();
  if (!t.selections?.length && !newVenues.length)
    throw new Error("请先完成第一步：搜索并加入博物馆清单");
  const all = new Map([...boot.venues, ...newVenues].map((v) => [v.id, v])),
    stops = t.stops.map((s) => ({
      ...s,
      minutes: s.minutes,
    }));
  for (const v of [...collectedVenues(), ...newVenues])
    if (!stops.some((s) => s.id === v.id)) {
      const last = stops.at(-1),
        day = last?.day || 1,
        dayMinutes = stops
          .filter((s) => s.day === day)
          .reduce((n, s) => n + s.minutes, 0);
      stops.push({
        id: v.id,
        day: Math.min(
          30,
          dayMinutes + (v.kind && v.kind !== "museum" ? 60 : 240) > 480
            ? day + 1
            : day,
        ),
        minutes: v.kind && v.kind !== "museum" ? 60 : 240,
      });
    }
  planDraft = {
    tripId: t.id,
    revision: t.revision,
    venues: newVenues,
    all,
    stops,
  };
  dialog(
    "② 排顺序，安排 Day N",
    '<p class="micro">拖住一行调整顺序，也可用上下箭头。每馆4小时基本参观，6–8小时深度参观。日程只按Day N安排；下方统计不含未安排的交通和用餐。</p><div id="plan-list"></div><div id="plan-summary" class="plan-summary"></div><button type="submit" class="primary">确认加入并保存路线</button>',
    async () => {
      const p = planDraft;
      if (!p || trip?.id !== p.tripId || trip.revision !== p.revision)
        throw new Error("旅行已变化，请关闭后重新安排");
      if (!p.stops.length) throw new Error("请保留至少一处馆址");
      let r;
      if (p.venues.length) {
        r = await api("/plan-import", {
          method: "POST",
          body: JSON.stringify({
            tripId: p.tripId,
            inputRevision: p.revision,
            venues: p.venues,
            stops: p.stops,
          }),
        });
        boot.venues = r.venues;
        boot.candidates = r.candidates;
        trip = r.trip;
      } else
        await mutate((x) => {
          x.stops = p.stops;
        });
      planDraft = null;
      $("#driving-results").textContent = "路线已更新，请重新核算驾车路段。";
      showTab("route");
      toast("Day N路线已保存，可以继续调整或交给Agent补充路书");
    },
  );
  renderPlan();
}
function renderPlan() {
  if (!planDraft || !$("#plan-list")) return;
  const p = planDraft;
  $("#plan-list").innerHTML = p.stops
    .map((s, i) => {
      const v = p.all.get(s.id);
      return `<article class="plan-row" draggable="true" data-plan-id="${esc(s.id)}"><span class="plan-grip" aria-hidden="true">⠿</span><div><h3>${i + 1}. ${esc(v.name)}</h3><small>${esc(v.address)}</small><div class="plan-options"><label>日程<select data-plan-day="${esc(s.id)}">${Array.from(
        { length: 30 },
        (_, n) => n + 1,
      )
        .map(
          (d) =>
            `<option value="${d}" ${d === s.day ? "selected" : ""}>Day ${d}</option>`,
        )
        .join(
          "",
        )}</select></label><label>参观<select data-plan-minutes="${esc(s.id)}">${durationOptions(s.minutes, v.kind)}</select></label></div></div><div class="plan-controls"><button type="button" class="quiet" data-plan-move="${esc(s.id)}" data-delta="-1" aria-label="上移${esc(v.name)}" ${i === 0 ? "disabled" : ""}>↑</button><button type="button" class="quiet" data-plan-move="${esc(s.id)}" data-delta="1" aria-label="下移${esc(v.name)}" ${i === p.stops.length - 1 ? "disabled" : ""}>↓</button></div></article>`;
    })
    .join("");
  renderPlanSummary();
}
function renderPlanSummary() {
  const totals = new Map();
  for (const s of planDraft.stops)
    totals.set(s.day, (totals.get(s.day) || 0) + s.minutes);
  $("#plan-summary").innerHTML = [...totals]
    .sort((a, b) => a[0] - b[0])
    .map(
      ([d, n]) =>
        `<div>Day ${d} · 参观合计 ${n / 60}小时${n > 480 ? " · 较紧凑，建议减少馆数或多安排一天" : ""}</div>`,
    )
    .join("");
}
function selectionCount() {
  if ($("#selection-count"))
    $("#selection-count").textContent =
      "已选" +
      document.querySelectorAll("input[name=poi]:checked").length +
      "处";
}
document.addEventListener("change", (e) => {
  if (e.target.matches("input[name=poi]")) {
    if (searchSelection === "single" && e.target.checked)
      document.querySelectorAll("input[name=poi]").forEach((x) => {
        if (x !== e.target) x.checked = false;
      });
    selectionCount();
  }
  if (planDraft) {
    const id = e.target.dataset.planDay || e.target.dataset.planMinutes,
      s = planDraft.stops.find((s) => s.id === id);
    if (s) {
      if (e.target.dataset.planDay) s.day = Number(e.target.value);
      else s.minutes = Number(e.target.value);
      renderPlanSummary();
    }
  }
});
document.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.selectMode) {
    searchSelection = b.dataset.selectMode;
    document
      .querySelectorAll("[data-select-mode]")
      .forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    if (searchSelection === "single") {
      const checked = [...document.querySelectorAll("input[name=poi]:checked")];
      checked.slice(1).forEach((x) => (x.checked = false));
    }
    selectionCount();
  }
  if (
    b.hasAttribute("data-select-all") ||
    b.hasAttribute("data-select-clear")
  ) {
    if (b.hasAttribute("data-select-all")) searchSelection = "multi";
    document
      .querySelectorAll("input[name=poi]")
      .forEach((x) => (x.checked = b.hasAttribute("data-select-all")));
    selectionCount();
  }
  if (b.dataset.planMove && planDraft) {
    planDraft.stops = moveStop(
      planDraft.stops,
      b.dataset.planMove,
      Number(b.dataset.delta),
    );
    renderPlan();
  }
});
document.addEventListener("dragstart", (e) => {
  const row = e.target.closest("[data-plan-id]");
  if (!row) return;
  dragPlanId = row.dataset.planId;
  e.dataTransfer.setData("text/plain", dragPlanId);
  e.dataTransfer.effectAllowed = "move";
  row.classList.add("dragging");
});
document.addEventListener("dragover", (e) => {
  if (dragPlanId && e.target.closest("[data-plan-id]")) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }
});
document.addEventListener("drop", (e) => {
  const row = e.target.closest("[data-plan-id]");
  if (!row || !planDraft || !dragPlanId) return;
  e.preventDefault();
  const from = planDraft.stops.findIndex((s) => s.id === dragPlanId),
    to = planDraft.stops.findIndex((s) => s.id === row.dataset.planId);
  if (from >= 0 && to >= 0) {
    const [item] = planDraft.stops.splice(from, 1);
    planDraft.stops.splice(to, 0, item);
  }
  dragPlanId = null;
  renderPlan();
});
document.addEventListener("dragend", () => {
  dragPlanId = null;
  document
    .querySelectorAll(".plan-row.dragging")
    .forEach((x) => x.classList.remove("dragging"));
});

async function locateCity() {
  const city = $("#city").value.trim();
  if (!city) throw new Error("请输入目的地城市");
  const r = await api("/amap", {
      method: "POST",
      body: JSON.stringify({
        action: "geo",
        params: { address: city.replace(/市$/, "") + "市", city },
      }),
    }),
    g = r.geocodes?.[0];
  if (!g?.location) throw new Error("没有找到城市中心，请用完整城市名重试");
  const [longitude, latitude] = g.location.split(",").map(Number);
  center = { longitude, latitude, crs: "GCJ-02" };
  centerName = city + "城市中心";
  if (trip)
    await mutate((t) => {
      t.settings.destination = city;
      t.settings.center = center;
    });
  map.setView([latitude, longitude], 10);
  page = 1;
  showTab("discover");
  toast("已使用城市中心作为直线半径起点，可在馆址详情中改变中心");
}
async function driving() {
  await pendingWrites;
  const t = needTrip();
  if (t.stops.length < 2) throw new Error("至少加入两个馆址");
  $("#driving-results").textContent = "正在查询高德驾车路段…";
  const r = await api("/driving", {
    method: "POST",
    body: JSON.stringify({ tripId: t.id, revision: t.revision }),
  });
  if (trip?.id !== t.id || trip.revision !== r.inputRevision) return;
  $("#driving-results").innerHTML =
    r.legs
      .map(
        (l) =>
          `<div>${esc(boot.venues.find((v) => v.id === l.from)?.name)} → ${esc(boot.venues.find((v) => v.id === l.to)?.name)}：${(l.distanceMeters / 1000).toFixed(1)}km，约${Math.round(l.durationSeconds / 60)}分钟</div>`,
      )
      .join("") +
    `<small>${esc(r.note)}；输入revision ${r.inputRevision}。调整站序后请重新核算。</small>`;
}
document.addEventListener(
  "click",
  safe(async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const d = b.dataset;
    if (d.tab) showTab(d.tab);
    if (d.go) {
      if (d.go === "route" && draftSelection.length) {
        if (!trip) {
          newTrip();
          return;
        }
        await commitDraftSelection();
      }
      showTab(d.go);
    }
    if (d.filter) {
      filter = d.filter;
      page = 1;
      document
        .querySelectorAll("[data-filter]")
        .forEach((x) => x.classList.toggle("selected", x === b));
      refresh();
    }
    if (d.close) document.getElementById(d.close).close();
    if (d.detail) await detail(d.detail);
    if (d.recommend) await recommendPlaces(d.recommend);
    if (d.archiveOpen) openRoadbook(d.archiveOpen);
    if (d.archiveManage) await manageRoadbook(d.archiveManage, d.action);
    if (d.checkExport) {
      const r = await api("/check-apply", {
        method: "POST",
        body: JSON.stringify({ id: d.checkExport }),
      });
      boot.roadbooks = r.roadbooks;
      boot.artifacts = r.artifacts;
      boot.venues = r.venues;
      boot.checks = r.checks;
      openRoadbook(r.roadbook.id);
      await performArchiveDownload(r.roadbook.id, d.format, d.share === "true");
      if (r.warning) toast(r.warning);
    }

    if (d.archiveDownload)
      await downloadArchive(d.archiveDownload, d.format, d.share === "true");
    if (d.archiveAgent) await archiveAgent(d.archiveAgent);
    if (d.archiveHtmlAgent) await archiveAgent(d.archiveHtmlAgent, true);
    if (d.archiveContinue) await continueArchive(d.archiveContinue);
    if (d.archiveCopy) await copyArchive(d.archiveCopy);
    if (d.artifactPreview) await previewArtifact(d.artifactPreview);
    if (d.artifactConfirm) {
      const r = await api("/artifacts", {
        method: "PUT",
        body: JSON.stringify({ id: d.artifactConfirm }),
      });
      boot.artifacts = r.artifacts;
      openRoadbook(
        r.artifacts.find((a) => a.id === d.artifactConfirm).payload.roadbookId,
      );
      toast("内容已标为用户确认");
    }
    if (d.uncollect)
      await updateSelection((ids) => ids.filter((id) => id !== d.uncollect));
    if (d.add) await add(d.add);
    if (d.favorite) await favorite(d.favorite);
    if (d.move) {
      await mutate((t) => {
        t.stops = moveStop(t.stops, d.move, Number(d.delta));
      });
      $("#driving-results").textContent = "站序已变化，原路段估算已失效。";
    }
    if (d.remove)
      await mutate((t) => {
        t.stops = t.stops.filter((x) => x.id !== d.remove);
      });
    if (d.center) {
      const v = boot.venues.find((v) => v.id === d.center);
      center = { longitude: v.longitude, latitude: v.latitude, crs: v.crs };
      centerName = v.name;
      if (trip)
        await mutate((t) => {
          t.settings.center = center;
        });
      $("#detail").close();
      map.setView([center.latitude, center.longitude], 10);
      refresh();
    }
    if (d.advice) {
      $("#detail").close();
      await sendPrompt(
        "重点核实：" + boot.venues.find((v) => v.id === d.advice).name,
      );
    }
    if (d.askName)
      await sendPrompt(
        "核实并定位历史名录中的馆：" +
          d.askName +
          "；不得假设当前仍使用旧名或位于当前城市。",
      );
    if (d.match) await searchOnline(d.name, d.match);
    if (d.export) await exportTrip(d.export);
    if (d.review) {
      const r = await api("/review", {
        method: "POST",
        body: JSON.stringify({ id: d.review, accept: d.accept === "true" }),
      });
      boot.candidates = r.candidates;
      boot.venues = r.venues;
      renderResults();
    }
  }),
);

function renderRoadbookList() {
  const stateFilter = $("#archive-status").value;
  $("#roadbook-list").innerHTML = (boot.roadbooks || [])
    .filter(a => !$("#archive-city").value.trim() || (a.snapshot.destination || "").includes($("#archive-city").value.trim()))
    .filter(a => {
      const state=a.recordState || "active";
      if (["archived","deleted"].includes(stateFilter)) return state === stateFilter;
      if (stateFilter === "all") return state !== "deleted";
      return state === "active" && (!stateFilter || a.snapshot.status === stateFilter);
    })
    .filter(a => $("#archive-scope").value === "all" || a.trip_id === trip?.id)
    .map(a => {
      const state=a.recordState || "active", rows=a.snapshot.stops.length ? a.snapshot.stops : a.snapshot.selections;
      const when=new Date(a.created_at), date=Number.isNaN(+when) ? "时间待补" : when.toLocaleString("zh-CN",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false});
      return `<article class="roadbook-row"><div class="roadbook-summary"><div class="roadbook-title"><h3>${esc(a.snapshot.title)}</h3><span class="version-note">第 ${a.version} 版</span>${state === "archived" ? '<span class="tag">已存档</span>' : state === "deleted" ? '<span class="tag">已删除</span>' : ""}</div><p>${esc(a.snapshot.destination || "目的地待定")} · ${a.snapshot.stops.length ? "已编排" : "待编排"} · ${rows.length} 处</p><time datetime="${esc(a.created_at)}">${esc(date)}</time></div><div class="roadbook-actions">${state === "deleted" ? `<button class="outline" data-archive-manage="${esc(a.id)}" data-action="restore">恢复路书</button>` : `<button class="outline" data-archive-open="${esc(a.id)}">浏览 →</button><details class="roadbook-more"><summary aria-label="${esc(a.snapshot.title)}第${a.version}版更多操作">更多 ···</summary><div class="roadbook-menu"><button class="quiet" data-archive-continue="${esc(a.id)}">修改路书</button><button class="quiet" data-archive-manage="${esc(a.id)}" data-action="${state === "archived" ? "restore" : "archive"}">${state === "archived" ? "移回最近" : "存档"}</button><button class="quiet danger" data-archive-manage="${esc(a.id)}" data-action="delete">删除</button></div></details>`}</div></article>`;
    }).join("") || `<div class="empty archive-empty"><h3>${stateFilter ? "这里还没有路书" : "留下一份自己的行记"}</h3><p>${stateFilter ? "可以切换显示范围查看其他路书。" : "设计好清单或 Day N 后，保存第一版路书。"}</p><button class="outline" data-go="route">去设计路书 →</button></div>`;
}
async function manageRoadbook(id, action) {
  const a=archiveById(id);
  const apply=async()=>{
    const r=await api("/roadbooks",{method:"PUT",body:JSON.stringify({id,action})});
    boot.roadbooks=r.roadbooks;
    renderRoadbookList();
    toast(action === "delete" ? "已移到「已删除」，可恢复；导出文件保留" : action === "archive" ? "已存档，可在「已存档」中浏览" : "已移回最近路书");
  };
  if(action === "delete") {
    $("#detail").close();
    dialog("删除这份路书？",`<p>${esc(a.snapshot.title)} · 第 ${a.version} 版</p><p>将移到「已删除」，可以恢复。不会删除其他版本、当前设计、收藏或已导出的文件。</p><button type="submit" class="primary">确认删除</button>`,apply);
  } else await apply();
}

function archiveById(id) {
  const a = boot.roadbooks?.find((a) => a.id === id);
  if (!a) throw new Error("路书不存在，请重新读取");
  return a;
}
function openRoadbook(id) {
  const a = archiveById(id);
  $("#detail-content").innerHTML =
    `<div class="dialog-head"><h2>${esc(a.snapshot.title)} · v${a.version}</h2><button class="quiet" data-close="detail">关闭 ×</button></div><div class="roadbook-preview">${esc(roadbookText({ ...a.snapshot, preflight: undefined }))}</div>${a.snapshot.preflight ? `<details class="archive-verification"><summary>天气与参访核实 · ${esc(a.snapshot.preflight.checkedAt)}</summary>${preflightMarkup(a.snapshot.preflight)}</details>` : ""}<div class="archive-actions"><button class="primary" data-archive-agent="${esc(id)}">发送到原生 Agent</button><button class="outline" data-archive-html-agent="${esc(id)}">和 Agent 定制 HTML</button><button class="outline" data-archive-continue="${esc(id)}">修改路书</button></div><details><summary>附件与 Agent 完善结果</summary>${
      (boot.artifacts || [])
        .filter(
          (x) => x.payload.roadbookId === id && x.kind !== "roadbook-snapshot",
        )
        .map(
          (x) =>
            `<p>${esc(x.payload.title)} · ${esc(x.payload.format)}${x.kind === "agent-roadbook" ? " · " + (x.payload.status === "confirmed" ? "已确认" : "待确认") : ""}<button class="quiet" data-artifact-preview="${esc(x.id)}">浏览</button><a href="/api/find-museum/file?id=${encodeURIComponent(x.id)}" download>下载</a>${x.kind === "agent-roadbook" && x.payload.status !== "confirmed" ? `<button class="outline" data-artifact-confirm="${esc(x.id)}">确认内容</button>` : ""}</p>`,
        )
        .join("") || "<p>暂无附件；可下载分享版，或保存Agent完善后的内容。</p>"
    }</details><details open><summary>下载与分享给旅伴</summary><p class="micro">分享版仅含公开地点、Day N 和来源。下载后可自行发给旅伴，不生成本机分享链接。</p><div class="archive-actions">${["html", "md", "csv", "json"].map((f) => `<button class="outline" data-archive-download="${esc(id)}" data-format="${f}" data-share="true">下载 ${f.toUpperCase()}</button>`).join("")}<button class="quiet" data-archive-copy="${esc(id)}">复制行程摘要</button></div></details>`;
  if (!$("#detail").open) $("#detail").showModal();
}
async function archivePlan() {
  await pendingWrites;
  const t = needTrip();
  const r = await api("/roadbooks", {
    method: "POST",
    body: JSON.stringify({ tripId: t.id, revision: t.revision }),
  });
  boot.roadbooks = r.roadbooks;
  boot.artifacts = r.artifacts;
  showTab("results");
  openRoadbook(r.roadbook.id);
  toast(r.warning || "路书已存档；继续设计将保留这一版");
  return r.roadbook.id;
}
async function performArchiveDownload(id, format, share) {
  const a = archiveById(id),
    r = await api("/export", {
      method: "POST",
      body: JSON.stringify({ roadbookId: a.id, format, share }),
    });
  boot.artifacts = r.artifacts;
  const link = document.createElement("a");
  link.href = r.downloadUrl;
  link.download = a.snapshot.title + "." + format;
  link.click();
  renderResults();
  toast("核实版文件已生成，已保留原路书版本");
}
async function downloadArchive(id, format, share) {
  archiveById(id);
  toast("正在导出前核实高德与天气，请稍候…");
  const r = await api("/roadbook-check", {
    method: "POST",
    body: JSON.stringify({ roadbookId: id }),
  });
  boot.checks = r.checks;
  showPreflight(r.check.id, format, share);
}
function preflightMarkup(report) {
  const field = (v) => esc(v || "未提供");
  return (
    `<p class="soft-note">${esc(report.notice)}</p><div class="check-meta">查询时间：${field(report.checkedAt)}${report.window ? ` · 天气范围 ${esc(report.window.start)}—${esc(report.window.end)}（行程前后各1天）` : " · 请先设置行程日期以匹配天气"}</div>` +
    report.checks
      .map(
        (c) =>
          `<section class="check-place"><h3>${field(c.name)}</h3><p>${c.status === "queried" ? "已查询高德POI" : "未核实"} · 临时闭馆公告未确认${c.visitDate ? " · 参观 " + esc(c.visitDate) : ""}</p><p>最新常规时间：${field(c.openingHours || c.previousOpeningHours)}${!c.openingHours ? "（本次未返回新时间）" : ""}</p>${c.changed ? "<p>常规开放时间与存档不同，请留意核对。</p>" : ""}${c.error ? `<p class="soft-note">${esc(c.error)}</p>` : ""}${c.alerts.map((t) => `<p class="check-alert">△ ${esc(t)}</p>`).join("")}<a href="${esc(c.sourceUrl)}" target="_blank" rel="noopener noreferrer">位置来源 ↗</a></section>`,
      )
      .join("") +
    report.weather
      .map(
        (w) =>
          `<section class="check-weather"><h3>${esc(w.city)} · 天气</h3><small>高德发布 ${field(w.reportTime)}</small>${w.error ? `<p>未核实：${esc(w.error)}</p>` : ""}<div class="weather-grid">${w.casts.map((d) => `<div><b>${esc(d.date)}</b><p>${field(d.dayweather)} / ${field(d.nightweather)}</p><strong>${field(d.nighttemp)}—${field(d.daytemp)}℃</strong>${d.alerts.map((t) => `<p class="check-alert">△ ${esc(t)}</p>`).join("")}</div>`).join("")}</div>${w.missingDates.length ? `<p class="micro">${w.missingDates.length}天未到预报期或无数据：${esc(w.missingDates[0])}${w.missingDates.length > 1 ? "—" + esc(w.missingDates.at(-1)) : ""}；请临近出发再更新。</p>` : ""}</section>`,
      )
      .join("")
  );
}
function showPreflight(id, format, share) {
  const c = boot.checks?.find((c) => c.id === id);
  if (!c) throw Error("核实记录不存在");
  $("#detail-content").innerHTML =
    `<div class="dialog-head"><h2>导出前，核对这几件事</h2><button class="quiet" data-close="detail">关闭 ×</button></div><div class="preflight-view">${preflightMarkup(c.report)}</div><div class="archive-actions"><button class="primary" data-check-export="${esc(id)}" data-format="${esc(format)}" data-share="${share}">保存核实新版本并导出 ${esc(format.toUpperCase())}</button><button class="outline" data-archive-html-agent="${esc(c.roadbook_id)}">请 Agent 补查与定制 HTML</button></div><p class="micro">保留原档案；未核实内容会写入新版本的提醒页。</p>`;
  if (!$("#detail").open) $("#detail").showModal();
}

async function archiveAgent(id, customHtml = false) {
  const a = archiveById(id);
  const frozen = roadbookText(a.snapshot);
  $("#detail").close();
  if (trip?.id !== a.trip_id) await openTrip(a.trip_id);
  const p = customHtml
    ? personalizedHtmlPrompt(a.snapshot, {
        version: a.version,
        inputRevision: a.input_revision,
      })
    : `请协助完善下面这份已存档路书（第${a.version}版，输入revision ${a.input_revision}）。这是冻结快照，请勿用当前草稿替换；更新建议先请我确认。每个博物馆4–8小时，其他地点独立安排。请核实开放、预约、交通和特色，保留真实来源和日期；未知信息不要编造。结果可以保存到工作区output，再通过工作台“保存Agent路书”登记。\n\n${frozen}`;
  if (customHtml) {
    const t = needTrip();
    await api("/agent-context", {
      method: "POST",
      body: JSON.stringify({
        tripId: t.id,
        revision: t.revision,
        roadbookId: a.id,
      }),
    });
    if (trip?.id !== a.trip_id) throw new Error("旅行已切换，请重新选择路书");
  }
  if (isEmbedded) {
    await ensureSession();
    await bridge("draft", { tripId: a.trip_id, prompt: p });
    toast("已追加原生草稿，请确认后发送");
  } else
    dialog(
      "Agent提示词预览",
      `<textarea readonly>${esc(p)}</textarea><button type="submit" class="primary">关闭</button>`,
      async () => {},
    );
}
async function copyArchive(id) {
  const value = roadbookText(publicSnapshot(archiveById(id).snapshot));
  try {
    await navigator.clipboard.writeText(value);
    toast("已复制，分享前可自行检查");
  } catch {
    dialog(
      "选择并复制行程摘要",
      `<textarea readonly>${esc(value)}</textarea><button type="submit" class="primary">关闭</button>`,
      async () => {},
    );
  }
}
async function continueArchive(id) {
  const a = archiveById(id);
  $("#detail").close();
  if (trip?.id !== a.trip_id) await openTrip(a.trip_id);
  dialog(
    "修改这份路书",
    '<p>将用所选版本恢复此旅行的设计草稿。旧路书版本保留；尚未存档的草稿请先保存。</p><button type="submit" class="primary">进入设计并修改</button>',
    async () => {
      const r = await api("/roadbooks", {
        method: "PUT",
        body: JSON.stringify({ id: a.id, revision: trip.revision }),
      });
      trip = r.trip;
      showTab("route");
      toast("草稿已恢复，旧档案保持不变");
    },
  );
}
async function previewArtifact(id) {
  const a = boot.artifacts.find((x) => x.id === id),
    r = await fetch("/api/find-museum/file?id=" + encodeURIComponent(id));
  if (!r.ok) throw new Error("文件未找到或无法读取；档案索引仍保留");
  const content = await r.text();
  $("#detail-content").innerHTML =
    `<div class="dialog-head"><h2>${esc(a.payload.title || "结果文件")}</h2><button class="quiet" data-close="detail">关闭 ×</button></div>` +
    (a.payload.format === "html"
      ? `<iframe title="受限HTML预览" sandbox srcdoc="${esc(content)}" style="width:100%;height:55vh;border:0"></iframe>`
      : `<pre class="roadbook-preview">${esc(content)}</pre>`);
  if (!$("#detail").open) $("#detail").showModal();
}
const recommendationTags = [
  "特色小吃",
  "本地餐馆",
  "老字号",
  "周边景点",
  "Citywalk",
];
$("#recommend-tags").innerHTML = recommendationTags
  .map((t) => `<button class="chip" data-recommend="${t}">${t} ↗</button>`)
  .join("");
async function savePlaces(places, alsoTrip = false) {
  if (!boot.configured) await configureRoot();
  if (!boot.configured)
    throw new Error("未选择目录，尚未保存；可重新选择目录后操作");
  const current = trip;
  const r = await api("/places", {
    method: "POST",
    body: JSON.stringify({
      places,
      ...(alsoTrip ? { tripId: needTrip().id, revision: trip.revision } : {}),
    }),
  });
  boot.venues = r.venues;
  boot.favorites = r.favorites;
  if (r.trip && trip?.id === current?.id) trip = r.trip;
  refresh();
  toast(
    `新增 ${r.createdCount} 处收藏，${r.existingCount} 处已存在并保留笔记` +
      (alsoTrip ? "；已加入当前清单" : ""),
  );
}
async function recommendPlaces(tag) {
  const city = trip?.settings.destination || $("#city").value.trim();
  const requestTripId = trip?.id,
    requestRevision = trip?.revision;
  let recommendationCenter = null;
  if (trip?.settings.center) recommendationCenter = trip.settings.center;
  else {
    const g = await api("/amap", {
      method: "POST",
      body: JSON.stringify({ action: "geo", params: { address: city, city } }),
    });
    const point = g.geocodes?.[0]?.location?.split(",").map(Number);
    recommendationCenter = point
      ? { longitude: point[0], latitude: point[1], crs: "GCJ-02" }
      : null;
  }
  toast("正在检索 " + city + " · " + tag);
  const r = await api("/recommendations", {
    method: "POST",
    body: JSON.stringify({ tag, city, center: recommendationCenter }),
  });
  searchSelection = "multi";
  dialog(
    city + " · " + tag,
    `<p class="micro">${esc(r.note)}${r.radius ? ` · 半径 ${r.radius / 1000}km` : ""} · ${esc(r.checkedAt)}。当前有${r.places.length}条候选${r.places.length < 3 ? "，未凑数" : ""}；不代表大众点评榜单。${tag === "Citywalk" ? "这里只推荐地点，步行线路需另行核实。" : ""}</p><div class="selection-toolbar"><button type="button" class="outline" data-select-mode="single">单选</button><button type="button" class="outline" data-select-mode="multi">多选</button><button type="button" class="quiet" data-select-all>全选</button><button type="button" class="quiet" data-select-clear>清空</button><span id="selection-count">已选0处</span></div>` +
      r.places
        .map(
          (v, i) =>
            `<label class="poi-option"><input type="checkbox" name="poi" value="${i}"><span><strong>${esc(v.name)}</strong><small>${esc(v.address)}</small><small>${v.rating ? "高德评分 " + esc(v.rating.value) + (v.rating.scale ? " / " + esc(v.rating.scale) : "（平台原始值）") : "评分未提供"}${v.cost ? " · 高德人均 " + esc(v.cost) + "元" : ""}</small><a href="${esc(v.sourceUrl)}" target="_blank" rel="noopener noreferrer">高德详情/地图 ↗</a></span></label>`,
        )
        .join("") +
      `<label><input type="checkbox" name="alsoTrip" ${trip ? "" : "disabled"}>同时加入当前旅行清单${trip ? "" : "（请先新建旅行）"}</label><button class="primary" type="submit" ${r.places.length ? "" : "disabled"}>保存勾选到我的收藏</button>`,
    async (f) => {
      if (
        f.has("alsoTrip") &&
        (trip?.id !== requestTripId || trip?.revision !== requestRevision)
      )
        throw new Error("旅行已变化，请重新推荐后添加");
      const places = f.getAll("poi").map((i) => r.places[Number(i)]);
      if (!places.length) throw new Error("请先勾选地点");
      await savePlaces(places, f.has("alsoTrip"));
    },
  );
}
function manualPlace() {
  dialog(
    "添加旅行地点",
    '<label>名称<input name="name" required maxlength="160"></label><label>类别<select name="kind"><option value="museum">博物馆</option><option value="food">美食</option><option value="attraction">景点</option><option value="citywalk">Citywalk</option></select></label><label>城市<input name="city"></label><label>地址<input name="address"></label><label>公开来源链接（可选）<input type="url" name="source"></label><p class="micro">未定位地点可收藏与编排，暂不参加地图、距离和道路计算。</p><button type="submit" class="primary">保存到我的收藏</button>',
    async (f) =>
      savePlaces([
        {
          id: "manual-" + crypto.randomUUID(),
          name: f.get("name"),
          kind: f.get("kind"),
          city: f.get("city"),
          address: f.get("address"),
          sourceUrl: f.get("source") || "",
          provider: "manual",
          unlocated: true,
          openingStatus: "unknown",
          checkedAt: new Date().toISOString(),
        },
      ]),
  );
}
$("#supplement-places").onclick = () =>
  dialog(
    "补充沿途地点",
    '<p>以当前目的地和中心检索，候选由你勾选。保存时可同时加入当前清单。</p><div class="filters">' +
      recommendationTags
        .map(
          (t) =>
            `<button type="button" class="chip" data-recommend="${t}">${t} ↗</button>`,
        )
        .join("") +
      "</div>",
    async () => {},
  );
$("#manual-place").onclick = safe(manualPlace);
$("#archive-plan").onclick = safe(archivePlan);
$("#agent-html-route").onclick = safe(async () => {
  const id = await archivePlan();
  await archiveAgent(id, true);
});
function applyAppearance(value) {
  const theme = ["song", "classic"].includes(value) ? value : "song";
  document.body.dataset.theme = theme;
  $("#appearance-theme").value = theme;
  try {
    localStorage.setItem("find-museum.appearance", theme);
  } catch {}
  requestAnimationFrame(() => map?.invalidateSize());
}
try {
  applyAppearance(localStorage.getItem("find-museum.appearance") || "song");
} catch {
  applyAppearance("song");
}
$("#appearance-theme").onchange = (e) => applyAppearance(e.target.value);
$("#mobile-page").onchange = (e) => showTab(e.target.value);
$("#favorite-kind").onchange = renderFavorites;
$("#favorite-status").onchange = renderFavorites;
$("#archive-scope").onchange = renderResults;
$("#archive-city").oninput = renderRoadbookList;
$("#archive-status").onchange = renderRoadbookList;
$("#edit-route-plan").onclick = safe(() => openPlanner());
$("#new-trip").onclick = newTrip;
$("#choose-root").onclick = safe(configureRoot);
$("#choose-root-settings").onclick = safe(configureRoot);
$("#project-select").onchange = safe((e) => openTrip(e.target.value));
$("#search-button").onclick = safe(locateCity);
$("#online-search").onclick = safe(() => searchOnline());
$("#about-data").onclick = () => showTab("data");
$("#query").oninput = () => {
  page = 1;
  clearTimeout(searchCatalog.timer);
  searchCatalog.timer = setTimeout(refresh, 200);
};
$("#city").onchange = () => {
  page = 1;
  showTab("discover");
};
$("#grade").onchange = () => {
  page = 1;
  refresh();
};
$("#radius").onchange = refresh;
$("#prev-page").onclick = () => {
  if (page > 1) {
    page--;
    void searchCatalog();
  }
};
$("#next-page").onclick = () => {
  if (page * 40 < total) {
    page++;
    void searchCatalog();
  }
};
$("#fit-map").onclick = () => {
  const v = located();
  if (v.length)
    map.fitBounds(
      v.map((v) => [v.latitude, v.longitude]),
      { padding: [30, 30], maxZoom: 12 },
    );
  else map.setView([center.latitude, center.longitude], 10);
};
$("#large-font").onclick = () => {
  document.body.classList.toggle("large");
  map?.invalidateSize();
};
$("#open-session").onclick = safe(ensureSession);
$("#agent-route").onclick = safe(() => sendPrompt());
$("#calculate-driving").onclick = safe(driving);
$("#import-candidates").onclick = safe(importCandidates);
$("#import-candidates-results").onclick = safe(importCandidates);
$("#save-roadbook").onclick = safe(saveRoadbook);
$("#save-roadbook-results").onclick = safe(saveRoadbook);
$("#trip-title").onchange = safe((e) => mutate((t) => { t.title = e.target.value.trim(); }));
$("#trip-date").onchange = safe((e) =>
  mutate((t) => {
    t.settings.date = e.target.value;
  }),
);
$("#trip-mode").onchange = safe((e) =>
  mutate((t) => {
    t.settings.mode = e.target.value;
  }),
);
$("#route-list").onchange = safe((e) => {
  const id = e.target.dataset.day || e.target.dataset.minutes;
  if (!id) return;
  return mutate((t) => {
    const s = t.stops.find((s) => s.id === id);
    if (e.target.dataset.day) s.day = Number(e.target.value);
    else s.minutes = Number(e.target.value);
  });
});
$("#favorites-list").onchange = safe((e) => {
  if (e.target.dataset.note)
    return favorite(e.target.dataset.note, { note: e.target.value });
  if (e.target.dataset.visited)
    return favorite(e.target.dataset.visited, { visited: e.target.checked });
});
$("#map-key-form").onsubmit = safe(async (e) => {
  e.preventDefault();
  await api("/settings", {
    method: "POST",
    body: JSON.stringify({ amapWebServiceKey: $("#amap-key").value.trim() }),
  });
  $("#amap-key").value = "";
  await reload();
  map.fire("moveend");
  toast("Key仅保存在本机，未写入项目");
});
window.addEventListener("beforeunload", (e) => {
  if ($("#action-dialog").open) {
    e.preventDefault();
    e.returnValue = "";
  }
});
await safe(async () => {
  const root = localStorage.getItem(rootKey);
  if (root) {
    try {
      await api("/configure", {
        method: "POST",
        body: JSON.stringify({ dataRoot: root }),
      });
    } catch (e) {
      toast("原资料目录未连接：" + e.message);
    }
  }
  await reload();
  const last = localStorage.getItem(lastTripKey);
  if (last && boot.trips.some((t) => t.id === last))
    await openTrip(last, false);
  initMap();
  showTab(tab);
  $("#fit-map").click();
  if (isEmbedded) await bridge("ready");
  else $("#save-state").textContent = "独立开发预览 · 原生会话需在DSH中使用";
})();

$("#check-amap").onclick = safe(async () => {
  $("#map-config-status").textContent = "正在检查…";
  try {
    await api("/amap", {
      method: "POST",
      body: JSON.stringify({
        action: "geo",
        params: { address: "苏州市", city: "苏州" },
      }),
    });
    $("#map-config-status").textContent =
      "连接正常 · 地理编码可用；其他服务仍受各自权限与配额限制";
  } catch (e) {
    $("#map-config-status").textContent = "连接未成功：" + e.message;
    $("#map-settings").open = true;
  }
});
