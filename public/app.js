import { distanceKm, withinRadius, moveStop } from "./route.mjs";
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
  $("#coverage").textContent =
    `已定位 ${boot.venues.length} 处馆址 · 开放状态需按日期核实`;
  $("#located-count").textContent = boot.venues.length;
  $("#venue-total").textContent =
    `${boot.venues.length} 个馆址，${new Set(boot.venues.map((v) => v.museumId)).size} 个机构`;
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
  refresh();
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
            center,
          },
        }),
      });
      await reload();
      trip = r.trip;
      localStorage.setItem(lastTripKey, trip.id);
      renderProjects();
      refresh();
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
  return withinRadius(boot.venues, center, radius).located.filter(
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
  const selected = trip?.selections?.includes(v.id),
    fav = boot.favorites.some((f) => f.id === v.id);
  let distance = "待定位";
  try {
    distance = distanceKm(center, v).toFixed(1) + " km · 直线";
  } catch {}
  return `<article class="museum-card"><div class="card-top"><span class="category ${v.county ? "county" : ""}">${esc(v.label || "已定位馆址")}</span><span class="distance">${distance}</span></div><h3><button class="card-detail" data-detail="${esc(v.id)}">${esc(v.name)}</button></h3><p>${esc(v.intro || "特色介绍待核实，可交给 Agent 补充。")}</p><div class="card-tags">${(v.themes || []).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}<span class="tag pending">${status(v)}</span></div><div class="card-actions"><button class="outline" data-add="${esc(v.id)}">${selected ? "✓ 已加入清单" : "+ 加入清单"}</button><button class="quiet" data-favorite="${esc(v.id)}" aria-label="${fav ? "取消收藏" : "收藏"}${esc(v.name)}">${fav ? "♥" : "♡"}</button><span class="grade-note">${v.grade ? "机构" + esc(v.grade) + " · " + esc(v.gradeAsOf || "年份待核实") : "等级待核实"}</span></div></article>`;
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
  list.forEach((v) => {
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
  const rows = selectedVenues();
  if (rows.length > 1)
    routeLine = L.polyline(
      rows.map((v) => [v.latitude, v.longitude]),
      { color: "#b65332", weight: 2, dashArray: "5 7" },
    ).addTo(map);
}
function showTab(t) {
  tab = t;
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
          route: "把喜欢的馆，串起来",
          favorites: "留一份好奇，给下一次",
          results: "走过之后，也有回响",
          data: "每一条信息，都有来处",
        }[t];
  refresh();
  if (t === "discover") requestAnimationFrame(() => map?.invalidateSize());
}
function refresh() {
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
            )}</select> 天</label><label>参观 <select data-minutes="${esc(v.id)}">${durationOptions(v.minutes)}</select></label></div></div><div class="stop-controls"><button class="quiet" data-move="${esc(v.id)}" data-delta="-1" aria-label="上移${esc(v.name)}" ${i === 0 ? "disabled" : ""}>↑</button><button class="quiet" data-move="${esc(v.id)}" data-delta="1" aria-label="下移${esc(v.name)}" ${i === rr.length - 1 ? "disabled" : ""}>↓</button><button class="quiet" data-remove="${esc(v.id)}" aria-label="移除${esc(v.name)}">×</button></div></article>`,
      )
      .join("") ||
    '<div class="empty">清单与路线分开保存；收集好后点击“开始排序 / 调整 Day N”。</div>';
  let km = 0;
  for (let i = 1; i < rr.length; i++)
    if (rr[i].day === rr[i - 1].day) km += distanceKm(rr[i - 1], rr[i]);
  $("#distance-total").textContent =
    `${rr.length}馆址 · 同日相邻直线合计${km.toFixed(1)}km（非路程）`;
}
function renderFavorites() {
  $("#favorites-list").innerHTML =
    boot.favorites
      .map((f) => {
        const v = boot.venues.find((v) => v.id === f.id);
        return v
          ? card(v) +
              `<div class="favorite-extra"><label><input type="checkbox" data-visited="${esc(v.id)}" ${f.visited ? "checked" : ""}> 已参观</label><textarea class="favorite-note" data-note="${esc(v.id)}" aria-label="${esc(v.name)}笔记" placeholder="记下感兴趣的展品或参观感受">${esc(f.note || "")}</textarea></div>`
          : "";
      })
      .join("") || '<div class="empty">收藏的馆和参观笔记会保存在本机。</div>';
}
function renderResults() {
  $("#candidate-list").innerHTML = boot.candidates
    .filter((x) => x.status === "pending" && (!trip || x.trip_id === trip.id))
    .map(
      (c) =>
        `<article class="candidate"><b>待确认 · ${esc(c.payload.name)}</b><small>${esc(boot.trips.find((t) => t.id === c.trip_id)?.title || c.trip_id)} · ${esc(c.status)}</small><p>${esc(c.payload.address)}<br>${esc(c.payload.longitude)},${esc(c.payload.latitude)} (${esc(c.payload.crs)})<br>开放状态：${esc(c.payload.openingStatus)} · <a href="${esc(c.payload.sourceUrl)}" target="_blank" rel="noopener noreferrer">查看来源</a></p><p>来自旅行revision ${c.payload.inputRevision}；确认后加入本地馆址。请检查是否匹配了正确的馆，而非停车场。</p><button class="outline" data-review="${esc(c.id)}" data-accept="true">确认加入</button><button class="quiet" data-review="${esc(c.id)}" data-accept="false">拒绝</button></article>`,
    )
    .join("");
  $("#results-list").innerHTML =
    boot.artifacts
      .filter((a) => !trip || a.trip_id === trip.id)
      .map(
        (a) =>
          `<article class="artifact-row"><b>${esc(a.payload.title || a.kind)}</b><small>${esc(a.created_at)} · ${esc(a.payload.format)} · 输入revision ${a.payload.revision}</small><a href="/api/find-museum/file?id=${encodeURIComponent(a.id)}" download>打开/下载结果文件 →</a><small>SHA-256：${esc(a.payload.sha256)}</small></article>`,
      )
      .join("") ||
    '<div class="empty">导出路线、导入核实候选或保存路书后，可在这里回顾。</div>';
}
async function detail(id) {
  const v = boot.venues.find((x) => x.id === id);
  if (!v) return;
  $("#detail-content").innerHTML =
    `<div class="dialog-head"><div><p class="eyebrow">${esc(v.label || "馆址")} · ${esc(v.district || "")}</p><h2>${esc(v.name)}</h2></div><button class="quiet" data-close="detail">关闭 ×</button></div><div class="detail-section"><h3>特色与展品</h3><p>${esc(v.intro || "介绍待核实")}</p><p>${esc(v.featuredExhibits || "具体在展展品待核实")}</p>${v.introSource ? `<a href="${esc(v.introSource)}" target="_blank" rel="noopener noreferrer">介绍来源 ↗</a>` : ""}</div><div class="detail-section"><h3>位置</h3><p>${esc(v.address)}<br>${v.longitude}, ${v.latitude} · ${esc(v.crs)}</p><a href="${esc(v.sourceUrl)}" target="_blank" rel="noopener noreferrer">位置来源 ↗</a><button class="quiet" data-center="${esc(v.id)}">以此馆为周边中心</button></div><div class="detail-section"><h3>常规时间与临时状态</h3><p>${esc(v.openingHours || "未知")}</p><p class="soft-note">${status(v)}；核实日：${esc(v.checkedAt || "未记录")}；有效期：${esc(v.validFrom || "未确认")} 至 ${esc(v.validTo || "未确认")}</p></div><div class="detail-section"><h3>官网与公众号</h3>${v.officialUrl ? `<a href="${esc(v.officialUrl)}" target="_blank" rel="noopener noreferrer">官网/主管部门 ↗</a>` : "<p>官网待核实</p>"}<p>${esc(v.wechatName || "公众号账号待核实")}</p>${v.wechatUrl ? `<a href="${esc(v.wechatUrl)}" target="_blank" rel="noopener noreferrer">公众号来源 ↗</a>` : ""}</div><div class="card-actions"><button class="primary" data-add="${esc(v.id)}">加入路线</button><button class="outline" data-advice="${esc(v.id)}">请 Agent 核实</button></div>`;
  $("#detail").showModal();
}
function prompt(extra = "") {
  const t = needTrip();
  return [
    `请使用博物馆路线规划技能协助我。`,
    `旅行：${t.title}；tripId：${t.id}；inputRevision：${t.revision}`,
    `工作区：${t.settings.folder}；先读CONTEXT.md。`,
    `目的地：${t.settings.destination || $("#city").value}；日期：${t.settings.date || "待定"}；交通：${t.settings.mode}`,
    "按Day N规划，不需要出发时刻。每馆4小时基本参观，6–8小时深度参观，不安排1–2小时打卡。以下顺序由用户安排，优化先提建议，不直接覆盖。",
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
  if (!trip) {
    toast("先新建旅行，再收集博物馆");
    newTrip();
    return;
  }
  if (trip.selections?.includes(id)) {
    toast("已加入清单，可继续收集或到第二步编排");
    return;
  }
  await updateSelection((ids) => [...ids, id]);
  toast("已加入清单，不分配时间或天数；收集好后再排序安排");
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
  toast("真实文件已保存到output，并登记到路书与结果");
}
function durationOptions(minutes) {
  return [240, 360, 480]
    .map(
      (n) =>
        `<option value="${n}" ${n === minutes ? "selected" : ""}>${n / 60}小时 · ${n === 240 ? "基本参观" : "深度参观"}</option>`,
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
  const pois = (result.pois || []).filter(
    (p) =>
      p.typecode?.startsWith("1401") &&
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
        : "<p>未找到合适馆址，请更换名称或交给Agent。</p>"),
    async (f) => {
      const selected = f.getAll("poi").map((i) => pois[Number(i)]);
      if (!selected.length) throw new Error("请至少选择一处馆址");
      const t = needTrip(),
        tripId = t.id,
        revision = t.revision;
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
      toast("已加入博物馆清单。可继续搜索，或到“我的路线”排序和安排Day N。");
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
      minutes: Math.max(240, Math.min(480, s.minutes)),
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
        day: Math.min(30, dayMinutes + 240 > 480 ? day + 1 : day),
        minutes: 240,
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
    '<p class="micro">拖住一行调整顺序，也可用上下箭头。每馆4小时基本参观，6–8小时深度参观。日程只按Day N安排；下方统计不含交通和用餐。</p><div id="plan-list"></div><div id="plan-summary" class="plan-summary"></div><button type="submit" class="primary">确认加入并保存路线</button>',
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
        )}</select></label><label>参观<select data-plan-minutes="${esc(s.id)}">${durationOptions(s.minutes)}</select></label></div></div><div class="plan-controls"><button type="button" class="quiet" data-plan-move="${esc(s.id)}" data-delta="-1" aria-label="上移${esc(v.name)}" ${i === 0 ? "disabled" : ""}>↑</button><button type="button" class="quiet" data-plan-move="${esc(s.id)}" data-delta="1" aria-label="下移${esc(v.name)}" ${i === p.stops.length - 1 ? "disabled" : ""}>↓</button></div></article>`;
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
    if (d.go) showTab(d.go);
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
  map.invalidateSize();
};
$("#open-session").onclick = safe(ensureSession);
$("#agent-route").onclick = safe(() => sendPrompt());
$("#calculate-driving").onclick = safe(driving);
$("#import-candidates").onclick = safe(importCandidates);
$("#import-candidates-results").onclick = safe(importCandidates);
$("#save-roadbook").onclick = safe(saveRoadbook);
$("#save-roadbook-results").onclick = safe(saveRoadbook);
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
  refresh();
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
  }
});
