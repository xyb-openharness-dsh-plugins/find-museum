window.__ModuleLoader__.load({
  id: "@xyb-community/find-museum",
  factory(require) {
    const React = require("react"),
      h = React.createElement;
    let ctx,
      frame = null,
      selectedTrip = null,
      bindings = {},
      notice = "",
      action = 0;
    const listeners = new Set();
    const pendingKey = "find-museum.pending-drafts.v1",
      lastKey = "find-museum.last-trip.v1";
    let pending = {},
      delivered = {};
    try {
      const j = JSON.parse(localStorage.getItem(pendingKey) || "{}");
      pending = j.pending || {};
      delivered = j.delivered || {};
      selectedTrip = localStorage.getItem(lastKey) || null;
    } catch {}
    const persist = () => {
      try {
        localStorage.setItem(
          pendingKey,
          JSON.stringify({ pending, delivered }),
        );
        if (selectedTrip) localStorage.setItem(lastKey, selectedTrip);
        else localStorage.removeItem(lastKey);
      } catch {}
    };
    const emit = () => listeners.forEach((f) => f());
    const show = (t) => {
      notice = t;
      emit();
    };
    const active = () => {
      try {
        return !!ctx?.desktopWorkbenches?.isActive?.();
      } catch {
        return false;
      }
    };
    const current = () => {
      try {
        return ctx?.desktopWorkbenches?.currentSession?.() || null;
      } catch {
        return null;
      }
    };
    const owner = (id) => {
      if (!id) return "none";
      try {
        return ctx.desktopWorkbenches.ownsSession(id) ? "owned" : "not-owned";
      } catch {
        return "unavailable";
      }
    };
    const owned = () => {
      const id = current();
      return owner(id) === "owned" ? id : null;
    };
    async function api(path, options = {}) {
      const r = await fetch("/api/find-museum" + path, {
        credentials: "same-origin",
        ...options,
        headers: { "content-type": "application/json", ...options.headers },
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "服务请求失败");
      return j;
    }
    const send = () => {
      frame?.contentWindow?.postMessage(
        {
          channel: "find-museum-host",
          type: "context",
          tripId: selectedTrip,
          sessionId: owned(),
          active: active(),
          notice,
        },
        window.location.origin,
      );
    };
    async function bind(sessionId, tripId) {
      if (!sessionId || !tripId || !active() || owned() !== sessionId) return;
      await api("/session-projects", {
        method: "POST",
        body: JSON.stringify({ sessionId, project: tripId }),
      });
      if (active() && owned() === sessionId) bindings[sessionId] = tripId;
    }
    function appendDraft(sessionId, prompt) {
      if (!active() || owned() !== sessionId)
        throw new Error("会话或工作台已切换，请重试");
      const scoped = ctx.sessions.scope(sessionId),
        conversation = scoped.get("conversation");
      if (!conversation) throw new Error("原生会话输入尚未就绪");
      const input = conversation.input.for(scoped),
        snap = input.state.getSnapshot();
      if (snap.occurrences?.length || (snap.phase && snap.phase !== "plain"))
        throw new Error("原生草稿含引用或正在提交，请先处理后再追加");
      const old = snap.draft || "";
      input.setDraft(old.trim() ? old + "\n\n" + prompt : prompt);
    }
    function flush() {
      const id = owned(),
        tripId = selectedTrip;
      if (!id || !active() || !tripId || !pending[tripId]) return;
      const key = id + ":" + tripId;
      if (delivered[key]) return;
      try {
        appendDraft(id, pending[tripId]);
        delivered[key] = true;
        delete pending[tripId];
        persist();
        show("开场白已追加到原生草稿，请确认后发送");
      } catch {
        /* Preserve request until composer is ready; no automatic sending. */
      }
    }
    async function ensure(tripId, folder) {
      const ticket = ++action;
      if (!active()) throw new Error("请先打开当前工作台");
      if (typeof ctx.desktopWorkbenches.ensureSession !== "function")
        throw new Error("Desktop缺少ensureSession能力");
      const id = await ctx.desktopWorkbenches.ensureSession({ folder });
      if (
        ticket !== action ||
        !active() ||
        owned() !== id ||
        selectedTrip !== tripId
      )
        return;
      await bind(id, tripId);
      send();
      flush();
    }
    function follow() {
      if (!active()) return;
      const id = owned();
      if (id && Object.prototype.hasOwnProperty.call(bindings, id)) {
        if (selectedTrip !== bindings[id]) {
          selectedTrip = bindings[id];
          ++action;
          persist();
        }
      } else if (id && selectedTrip) {
        void bind(id, selectedTrip).catch((e) =>
          show("会话项目关联尚未保存：" + e.message),
        );
      }
      send();
      flush();
    }
    function trusted(event) {
      return (
        active() &&
        event.origin === window.location.origin &&
        event.source === frame?.contentWindow &&
        event.data?.channel === "find-museum-business"
      );
    }
    async function onMessage(event) {
      if (!trusted(event)) return;
      const d = event.data,
        requestId = d.requestId;
      const reply = (ok, result) => {
        if (event.source === frame?.contentWindow)
          event.source.postMessage(
            {
              channel: "find-museum-host",
              type: "reply",
              requestId,
              ok,
              ...(ok ? { result } : { error: result }),
            },
            window.location.origin,
          );
      };
      try {
        if (d.type === "ready") {
          const j = await api("/session-projects");
          bindings = j.bindings || {};
          follow();
          send();
          reply(true, {});
          return;
        }
        if (d.type === "choose-root" || d.type === "choose-folder") {
          if (typeof ctx.uiWorkspace?.pickDirectory !== "function")
            throw new Error("Desktop目录选择器不可用");
          const ticket = ++action,
            path = await ctx.uiWorkspace.pickDirectory();
          if (ticket !== action || !active())
            return reply(false, "操作已取消或工作台已切换");
          return reply(true, { path: path || null });
        }
        if (d.type === "root-changed") {
          bindings = d.bindings || {};
          selectedTrip = null;
          ++action;
          persist();
          send();
          reply(true, {});
          return;
        }
        if (d.type === "select-trip") {
          const id = owned(),
            ticket = ++action;
          selectedTrip = d.tripId || null;
          persist();
          if (id && selectedTrip) await bind(id, selectedTrip);
          if (ticket === action) send();
          reply(true, {});
          return;
        }
        if (d.type === "trip-created") {
          selectedTrip = d.tripId;
          persist();
          pending[d.tripId] = String(d.prompt || "");
          persist();
          send();
          try {
            await ensure(d.tripId, d.folder);
          } catch (e) {
            show("旅行已创建；原生会话尚未打开：" + e.message);
          }
          reply(true, {});
          return;
        }
        if (d.tripId !== selectedTrip)
          throw new Error("旅行项目已切换，已保留原内容，请重新操作");
        if (d.type === "ensure-session") {
          await ensure(d.tripId, d.folder);
          reply(true, {});
          return;
        }
        if (d.type === "draft") {
          const id = owned();
          if (!id) throw new Error("请先通过“打开原生会话”建立当前工作台会话");
          appendDraft(id, String(d.prompt || ""));
          show("已追加到原生草稿，由你确认发送");
          reply(true, {});
          return;
        }
        throw new Error("不支持的工作台动作");
      } catch (e) {
        reply(false, e.message);
        show(e.message);
      }
    }
    function Panel() {
      const [, refresh] = React.useState(0),
        ref = React.useRef(null);
      React.useEffect(() => {
        const listener = () => refresh((n) => n + 1);
        listeners.add(listener);
        const mountedFrame = ref.current;
        frame = mountedFrame;
        send();
        return () => {
          listeners.delete(listener);
          if (frame === mountedFrame) frame = null;
        };
      }, []);
      return h(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
            minHeight: 0,
            height: "100%",
            flex: 1,
          },
        },
        notice &&
          h(
            "div",
            {
              role: "status",
              style: {
                padding: "7px 14px",
                fontSize: 12,
                background: "#fff6e9",
                color: "#775d36",
              },
            },
            notice,
          ),
        h("iframe", {
          ref,
          title: "寻馆业务面板",
          src: "/workbench/find-museum/",
          style: {
            border: 0,
            width: "100%",
            height: "100%",
            minHeight: 300,
            flex: 1,
          },
          onLoad() {
            frame = ref.current;
            send();
          },
        }),
      );
    }
    function apply(context) {
      ctx = context;
      ctx.effect(() => {
        window.addEventListener("message", onMessage);
        const a = ctx.desktopWorkbenches.subscribe(follow),
          b = ctx.sessions.list.subscribe(follow),
          timer = setInterval(flush, 1000);
        return () => {
          window.removeEventListener("message", onMessage);
          a();
          b();
          clearInterval(timer);
        };
      });
      ctx.effect(() =>
        ctx.desktopWorkbenches.register(
          {
            title: "寻馆",
            repository:
              "https://github.com/xyb-openharness-dsh-plugins/find-museum",
            description:
              "发现城市大馆与周边特色小馆，规划路线并交给原生Agent完善路书。",
            icon: "◎",
            panelTitle: "博物馆与旅行路线",
            version: "0.2.1",
            initialization: "empty",
            embedded: true,
            layout: { businessSide: "left", businessWidth: 0.65 },
          },
          Panel,
        ),
      );
    }
    return {
      apply,
      inject: ["desktopWorkbenches", "sessions", "conversation", "uiWorkspace"],
      appendDraft,
      trusted,
      owner,
    };
  },
});
