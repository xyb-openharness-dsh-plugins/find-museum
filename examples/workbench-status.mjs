// Community view-model example. No host API calls or authorization decisions.
// The adapter supplies verified, current inputs and discards stale generations.
const state = (code, tone, label) => ({ code, tone, label })

export function deriveWorkbenchStatus({ directory = {}, selectedProjectId = null, session = {} } = {}) {
  let folder
  switch (directory.phase) {
    case 'ready': folder = state('directory-ready', 'ok', '资料目录已连接'); break
    case 'unconfigured': folder = state('directory-unconfigured', 'neutral', '未连接资料目录'); break
    case 'error': folder = state('directory-error', 'error', '资料目录不可用'); break
    default: folder = state('directory-checking', 'pending', '正在检查资料目录')
  }

  let chat
  if (session.context === 'preview') {
    chat = state('session-preview', 'neutral', '原生会话仅在 Desktop 内可用')
  } else if (session.context !== 'desktop') {
    chat = state('session-unavailable', 'warning', '会话状态暂不可用')
  } else if (!selectedProjectId) {
    chat = state('session-no-project', 'neutral', '未选择项目')
  } else if (session.phase === 'error') {
    chat = state('session-unavailable', 'warning', '会话状态暂不可用')
  } else if (session.phase !== 'ready' || session.snapshotProjectId !== selectedProjectId ||
    (session.snapshotSessionId ?? null) !== (session.currentSessionId ?? null)) {
    chat = state('session-checking', 'pending', '正在检查会话')
  } else if (session.active !== true) {
    chat = state('session-inactive', 'neutral', '工作台未激活')
  } else if (session.ownership === 'unavailable') {
    chat = state('session-unavailable', 'warning', '会话状态暂不可用')
  } else if (
    session.currentSessionId && session.ownership === 'owned' &&
    session.mappedProjectId === selectedProjectId && session.mappingSaved === true
  ) {
    chat = state('session-bound', 'ok', '对话已绑定')
  } else if (session.hasProjectSession === true) {
    chat = state('session-other', 'warning', '项目会话未激活')
  } else if (session.currentSessionId) {
    chat = state('session-unbound', 'neutral', '当前对话未绑定')
  } else {
    chat = state('session-none', 'neutral', '尚无原生对话')
  }
  return { directory: folder, session: chat }
}
