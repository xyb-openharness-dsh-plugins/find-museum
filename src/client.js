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
      lastKey = "find-museum.last-trip.v1",
      agentKey = "find-museum.agent-intro.v1",
      widthKey = "find-museum.agent-pane.v1";
    let pending = {},
      delivered = {},
      agentPending = null;

    /* 会话面板参数（家族基线：默认 35%，可拖 25%–45%，步进 2%） */
    const AGENT_DEFAULT = 0.35,
      AGENT_MIN = 0.25,
      AGENT_MAX = 0.45,
      AGENT_STEP = 0.02,
      NARROW_BELOW = 760,
      DRAWER_MAX = 520;
    const clampWidth = (v) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return AGENT_DEFAULT;
      return Math.min(AGENT_MAX, Math.max(AGENT_MIN, n));
    };
    const round4 = (n) => Math.round(n * 10000) / 10000;
    function loadWidth() {
      try {
        return clampWidth(
          JSON.parse(localStorage.getItem(widthKey) || "null")?.width,
        );
      } catch {
        return AGENT_DEFAULT;
      }
    }
    function saveWidth(v) {
      try {
        localStorage.setItem(widthKey, JSON.stringify({ width: round4(v) }));
      } catch {}
    }
    let agentWidth = loadWidth(),
      paneOpen = true,
      connecting = false,
      agentNote = "";
    try {
      const j = JSON.parse(localStorage.getItem(pendingKey) || "{}");
      pending = j.pending || {};
      delivered = j.delivered || {};
      selectedTrip = localStorage.getItem(lastKey) || null;
      agentPending = JSON.parse(localStorage.getItem(agentKey) || "null");
      if (!agentPending?.sessionId || !agentPending?.prompt) agentPending = null;
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
    const persistAgent = () => {
      try {
        if (agentPending)
          localStorage.setItem(agentKey, JSON.stringify(agentPending));
        else localStorage.removeItem(agentKey);
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
      const sessionId = owned();
      const linkedSession = Object.entries(bindings).find(
        ([, tripId]) => tripId === selectedTrip,
      )?.[0] || null;
      frame?.contentWindow?.postMessage(
        {
          channel: "find-museum-host",
          type: "context",
          tripId: selectedTrip,
          sessionId,
          tripHasSession: !!linkedSession,
          sessionReady: !!sessionId && bindings[sessionId] === selectedTrip,
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
    /* 顶栏「AI 对话」的开场白同样是“只填不发”：composer 就绪后追加一次。 */
    function queueAgent(sessionId, prompt) {
      agentPending = { sessionId, prompt };
      persistAgent();
    }
    function flushAgent() {
      if (!agentPending) return false;
      if (owned() !== agentPending.sessionId) return false;
      try {
        appendDraft(agentPending.sessionId, agentPending.prompt);
        agentPending = null;
        persistAgent();
        show("开场白已追加到原生草稿，请确认后发送");
        return true;
      } catch {
        return false;
      }
    }
    function agentIntro() {
      return [
        "你正在协助我使用「寻馆」博物馆与旅行路线工作台。",
        "里面是我选中的目的地、想看的博物馆、路线与时间安排。",
        "分工：你帮我汇总馆点、指出缺项与冲突；看哪家、怎么走由我决定。",
        "没有记录的内容请写“没有”，不要补写或推测。",
      ].join("\n");
    }
    function waitOwned(id) {
      const deadline = Date.now() + 8000;
      return new Promise((resolve) => {
        const tick = () => {
          if (owned() === id || !active() || Date.now() >= deadline)
            return resolve(owned() === id);
          setTimeout(tick, 60);
        };
        tick();
      });
    }
    async function openAgent(prompt) {
      if (!active()) return show("请先打开当前工作台");
      const existing = owned();
      if (existing) {
        paneOpen = true;
        if (prompt) queueAgent(existing, String(prompt));
        send();
        flushAgent();
        emit();
        return;
      }
      if (typeof ctx?.desktopWorkbenches?.ensureSession !== "function")
        return show("当前 Desktop 版本不支持从面板调起会话；请从左侧会话列表新建会话");
      connecting = true;
      emit();
      try {
        const id = await ctx.desktopWorkbenches.ensureSession({});
        await waitOwned(id);
        if (selectedTrip && active()) {
          try {
            await bind(id, selectedTrip);
          } catch {
            /* 关联失败不挡住会话本身 */
          }
        }
        queueAgent(id, prompt ? String(prompt) : agentIntro());
        paneOpen = true;
        flushAgent();
        send();
        show("会话已就绪：草稿已填入右侧输入框，请确认后发送");
      } catch (e) {
        show("没能调起会话：" + e.message);
      } finally {
        connecting = false;
        emit();
      }
    }
    async function ensure(tripId, folder) {
      const ticket = ++action;
      if (!active()) throw new Error("请先打开当前工作台");
      if (typeof ctx.desktopWorkbenches.ensureSession !== "function")
        throw new Error("Desktop缺少ensureSession能力");
      const savedSessionId = Object.entries(bindings).find(
        ([, boundTripId]) => boundTripId === tripId,
      )?.[0];
      const id = await ctx.desktopWorkbenches.ensureSession({
        folder,
        ...(savedSessionId ? { sessionId: savedSessionId } : {}),
      });
      // Desktop may resolve ensureSession before its session-list subscription
      // has delivered the newly selected native session. Wait for the owner
      // transition instead of silently dropping the project binding/draft.
      const deadline = Date.now() + 8000;
      while (
        ticket === action &&
        active() &&
        (current() !== id || owner(id) !== "owned") &&
        Date.now() < deadline
      ) {
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
      if (
        ticket !== action ||
        !active() ||
        selectedTrip !== tripId
      )
        throw new Error("工作台或旅行已切换，会话未关联；请为当前旅行重试");
      if (current() !== id || owner(id) !== "owned")
        throw new Error("Desktop尚未切换到新会话，请稍后重试");
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
      }
      send();
      flush();
      flushAgent();
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
        if (d.type === "agent-open") {
          void openAgent();
          return reply(true, {});
        }
        if (d.type === "agent-draft") {
          void openAgent(String(d.prompt || ""));
          return reply(true, {});
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
          const ticket = ++action;
          selectedTrip = d.tripId || null;
          persist();
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

    /* ---------------- 样式（寻馆：墨绿 #285e50 / 陶橙 #b65332 / 纸底 #f5f6f2） ---------------- */

    const rootStyle = {
      display: "flex",
      flexDirection: "column",
      minWidth: 0,
      minHeight: 0,
      height: "100%",
      flex: 1,
      position: "relative",
      background: "#f5f6f2",
      color: "#253c37",
      font: '12.5px/1.6 -apple-system, "PingFang SC", sans-serif',
    };
    // 首个子元素必须是语义 <header>：避让 macOS 窗口按钮。
    const headerStyle = {
      display: "flex",
      alignItems: "center",
      gap: 8,
      flex: "0 0 auto",
      flexWrap: "wrap",
      padding: "6px 14px",
      paddingInlineStart:
        "calc(14px + var(--dsh-frame-leading-clearance, 0px))",
      borderBottom: "1px solid #dce3dd",
      background: "#fff",
    };
    const brandStyle = { fontWeight: 700, color: "#285e50", whiteSpace: "nowrap" };
    const verStyle = {
      fontSize: 11,
      fontWeight: 500,
      color: "#63736e",
      background: "#e8eee5",
      borderRadius: 999,
      padding: "1px 8px",
      whiteSpace: "nowrap",
    };
    const hintStyle = {
      flex: "1 1 auto",
      minWidth: 120,
      marginInlineStart: 8,
      color: "#63736e",
      fontSize: 11.5,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
    };
    const headerActionsStyle = {
      display: "flex",
      alignItems: "center",
      gap: 6,
      flex: "0 0 auto",
      marginLeft: "auto",
    };
    const bodyStyle = {
      position: "relative",
      display: "flex",
      flex: 1,
      minHeight: 0,
      minWidth: 0,
      overflow: "hidden",
    };
    const businessStyle = {
      flex: 1,
      minWidth: 0,
      minHeight: 0,
      display: "flex",
      flexDirection: "column",
    };
    const frameStyle = {
      border: 0,
      width: "100%",
      height: "100%",
      minHeight: 300,
      flex: 1,
      display: "block",
    };
    const paneStyle = {
      display: "flex",
      flexDirection: "column",
      flex: "0 0 auto",
      minWidth: 0,
      minHeight: 0,
      borderLeft: "1px solid #dce3dd",
      background: "#fff",
      overflow: "hidden",
    };
    const drawerStyle = {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      zIndex: 3,
      boxShadow: "-8px 0 24px rgba(37, 60, 55, 0.18)",
    };
    /* 分隔线：1px 常规线条，绝对定位，不占布局宽度；11px 热区负责命中。 */
    const splitterStyle = {
      position: "absolute",
      top: 0,
      bottom: 0,
      width: 1,
      marginRight: -0.5,
      zIndex: 2,
      background: "#dce3dd",
      cursor: "col-resize",
      touchAction: "none",
      transition: "background .15s ease, box-shadow .15s ease",
    };
    const SPLITTER_BRAND = "#285e50";
    const splitterRgba = (hex, alpha) => {
      const n = parseInt(String(hex).replace("#", ""), 16);
      return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
    };
    const splitterHoverStyle = {
      ...splitterStyle,
      background: SPLITTER_BRAND,
      boxShadow: `0 0 6px ${splitterRgba(SPLITTER_BRAND, 0.55)}`,
    };
    const splitterDragStyle = {
      ...splitterHoverStyle,
      boxShadow: `0 0 10px ${splitterRgba(SPLITTER_BRAND, 0.8)}`,
    };
    const splitterHitStyle = {
      position: "absolute",
      top: 0,
      bottom: 0,
      left: -5,
      width: 11,
      background: "transparent",
      cursor: "col-resize",
    };
    const splitterGripStyle = {
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: 14,
      height: 22,
      borderRadius: 4,
      background: SPLITTER_BRAND,
      color: "#fff",
      fontSize: 11,
      lineHeight: "22px",
      letterSpacing: "-1px",
      textAlign: "center",
      opacity: 0.95,
      pointerEvents: "none",
      userSelect: "none",
      boxShadow: "0 1px 4px rgba(0, 0, 0, 0.18)",
    };
    const dragShieldStyle = {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      zIndex: 4,
      cursor: "col-resize",
      background: "transparent",
      touchAction: "none",
    };
    const buttonStyle = {
      minHeight: 30,
      border: 0,
      borderRadius: 999,
      padding: "5px 12px",
      whiteSpace: "nowrap",
      background: "#285e50",
      color: "#fff",
      font: "inherit",
      fontWeight: 600,
      cursor: "pointer",
    };
    const ghostStyle = {
      ...buttonStyle,
      background: "transparent",
      color: "#285e50",
      border: "1px solid #cfdcd2",
    };
    const padStyle = {
      display: "flex",
      flexDirection: "column",
      gap: 8,
      justifyContent: "center",
      padding: 20,
      color: "#63736e",
      fontSize: 12.5,
      lineHeight: 1.75,
    };

    function Panel({ conversation }) {
      const [, refresh] = React.useState(0),
        ref = React.useRef(null),
        shellRef = React.useRef(null),
        dragHostRef = React.useRef(null);
      const [width, setWidth] = React.useState(() => agentWidth);
      const [narrow, setNarrow] = React.useState(false);
      const [dragging, setDragging] = React.useState(false);
      const [hovering, setHovering] = React.useState(false);
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
      // 窄屏判定用容器宽度，不用窗口宽度：宿主主区不等于整窗。
      React.useEffect(() => {
        const node = shellRef.current;
        if (!node || typeof ResizeObserver !== "function") return undefined;
        const observer = new ResizeObserver((entries) => {
          const w = entries[0]?.contentRect?.width ?? 0;
          setNarrow(w > 0 && w < NARROW_BELOW);
        });
        observer.observe(node);
        return () => observer.disconnect();
      }, []);
      React.useEffect(() => {
        if (!dragging) return undefined;
        const stop = () => {
          dragHostRef.current = null;
          setDragging(false);
        };
        const onMove = (event) => {
          const rect = dragHostRef.current?.getBoundingClientRect?.();
          if (!rect?.width) return;
          const snapped = clampWidth(
            Math.round((rect.right - event.clientX) / rect.width / AGENT_STEP) *
              AGENT_STEP,
          );
          agentWidth = round4(snapped);
          saveWidth(agentWidth);
          setWidth(agentWidth);
        };
        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", stop);
        document.addEventListener("pointercancel", stop);
        return () => {
          document.removeEventListener("pointermove", onMove);
          document.removeEventListener("pointerup", stop);
          document.removeEventListener("pointercancel", stop);
        };
      }, [dragging]);

      const canOpenSession =
        typeof ctx?.desktopWorkbenches?.ensureSession === "function";
      const hasConversation = Boolean(conversation);
      const percent = Math.round(width * 100);
      const paneVisible = paneOpen && (hasConversation || connecting);
      const agentLabel = !canOpenSession
        ? "AI 对话暂不可用"
        : connecting
          ? "正在连接…"
          : !hasConversation
            ? "AI 对话"
            : paneOpen
              ? "收起 AI 对话"
              : "打开 AI 对话";

      const onAgentClick = () => {
        if (!hasConversation) {
          void openAgent();
          return;
        }
        paneOpen = !paneOpen;
        send();
        emit();
      };
      const onSplitterPointerDown = (event) => {
        event.preventDefault();
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          /* 旧宿主无指针捕获：document 监听仍可拖动 */
        }
        dragHostRef.current = shellRef.current;
        setDragging(true);
      };
      const onSplitterKeyDown = (event) => {
        const apply = (v) => {
          const snapped = clampWidth(
            Math.round(v / AGENT_STEP) * AGENT_STEP,
          );
          agentWidth = round4(snapped);
          saveWidth(agentWidth);
          setWidth(agentWidth);
        };
        if (event.key === "ArrowLeft") return apply(agentWidth + AGENT_STEP);
        if (event.key === "ArrowRight") return apply(agentWidth - AGENT_STEP);
        if (event.key === "Home") return apply(AGENT_MAX);
        if (event.key === "End") return apply(AGENT_MIN);
      };

      return h(
        "div",
        { style: rootStyle },
        h(
          "header",
          { style: headerStyle },
          h("span", { style: brandStyle }, "◎ 寻馆"),
          h("span", { style: verStyle }, "v__VERSION__"),
          h(
            "span",
            {
              style: hintStyle,
              title: agentNote || notice || "界面由 public/ 提供，与原型同源",
            },
            agentNote || notice || "本机资料 · 博物馆与路线",
          ),
          h(
            "div",
            { style: headerActionsStyle },
            h(
              "button",
              {
                type: "button",
                style: buttonStyle,
                onClick: onAgentClick,
                disabled: connecting || (!hasConversation && !canOpenSession),
                "aria-label": "AI 对话：" + agentLabel,
              },
              agentLabel,
            ),
            hasConversation && paneOpen
              ? h(
                  "button",
                  {
                    type: "button",
                    style: ghostStyle,
                    onClick: () => {
                      paneOpen = false;
                      send();
                      emit();
                    },
                    "aria-label": "收起 AI 对话面板",
                  },
                  "×",
                )
              : null,
          ),
        ),
        h(
          "div",
          { ref: shellRef, style: bodyStyle },
          h(
            "div",
            { style: businessStyle },
            h("iframe", {
              ref,
              title: "寻馆业务面板",
              src: "/workbench/find-museum/",
              style: frameStyle,
              onLoad() {
                frame = ref.current;
                send();
              },
            }),
          ),
          // 分隔线必须在业务区与会话之间：放到 aside 之后会贴到面板最右缘。
          !narrow && paneVisible
            ? h(
                "div",
                {
                  role: "separator",
                  "aria-orientation": "vertical",
                  "aria-label": "调整 AI 对话面板宽度",
                  "aria-valuemin": Math.round(AGENT_MIN * 100),
                  "aria-valuemax": Math.round(AGENT_MAX * 100),
                  "aria-valuenow": percent,
                  tabIndex: 0,
                  style: {
                    ...(dragging
                      ? splitterDragStyle
                      : hovering
                        ? splitterHoverStyle
                        : splitterStyle),
                    right: `${percent}%`,
                  },
                  onPointerDown: onSplitterPointerDown,
                  onPointerEnter: () => setHovering(true),
                  onPointerLeave: () => setHovering(false),
                  onKeyDown: onSplitterKeyDown,
                },
                h("span", { style: splitterHitStyle, "aria-hidden": "true" }),
                hovering || dragging
                  ? h(
                      "span",
                      { style: splitterGripStyle, "aria-hidden": "true" },
                      "⠿",
                    )
                  : null,
              )
            : null,
          // 原生会话始终挂载：收起走 display，不卸载（卸载会丢输入框状态）。
          h(
            "aside",
            {
              style: {
                ...paneStyle,
                ...(narrow ? drawerStyle : null),
                width: narrow ? `min(92%, ${DRAWER_MAX}px)` : `${percent}%`,
                display: paneVisible ? "flex" : "none",
              },
              "aria-label": "AI 对话",
              "aria-hidden": paneVisible ? undefined : "true",
            },
            conversation ??
              h(
                "div",
                { style: padStyle },
                h("b", null, "AI 对话还没开始"),
                h(
                  "span",
                  null,
                  "点顶栏「AI 对话」调起 DSH 原生会话后，它会固定出现在这一侧。",
                ),
                h(
                  "span",
                  null,
                  "没有会话也不影响行程：左侧的馆点与路线照常可用。",
                ),
              ),
          ),
          // 拖动遮罩：指针掠到业务 iframe 上时事件归子文档，遮罩让整块面板仍是命中区。
          dragging && !narrow
            ? h("div", { "aria-hidden": "true", style: dragShieldStyle })
            : null,
        ),
      );
    }
    function apply(context) {
      ctx = context;
      ctx.effect(() => {
        window.addEventListener("message", onMessage);
        const a = ctx.desktopWorkbenches.subscribe(follow),
          b = ctx.sessions.list.subscribe(follow),
          timer = setInterval(() => {
            flush();
            flushAgent();
          }, 1000);
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
            version: "__VERSION__",
            initialization: "empty",
            embedded: true,
            layout: { businessSide: "left", businessWidth: 0.65 },
            // customFrame：宿主把原生会话节点作为 conversation prop 交给 Panel 排版，
            // 本仓自绘顶栏按钮 + 右侧常挂载 aside + 可拖分隔线。
            customFrame: true,
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