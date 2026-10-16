// Demonstration only: read-only UI ownership check, never a server authorization decision.
// Default: no private-state fallback. Call with a correctly caller-bound public service.
export function readOwnership({ service, sessionId, entryId, legacy }) {
  if (!sessionId || !entryId) return { status: 'unavailable', reason: 'missing-session-or-entry' }
  let failure
  try {
    if (typeof service?.ownsSession !== 'function') return { status: 'unavailable', reason: 'capability-missing' }
    const owned = service.ownsSession(sessionId)
    if (typeof owned !== 'boolean') return { status: 'unavailable', reason: 'unsupported-result-contract' }
    return { status: owned ? 'owned' : 'not-owned', via: 'public-service' }
  } catch (error) { failure = error }
  const knownGuard = String(failure?.message).includes('Workbench registration requires a client package entry name.')
  const verifiedLegacy = legacy?.enabled === true && legacy.desktopVersion === '0.11.1' && legacy.harnessVersion === '0.2.0-rc.2'
  if (knownGuard && verifiedLegacy && typeof legacy.readBindings === 'function') {
    try {
      const bindings = legacy.readBindings()
      if (!bindings || typeof bindings !== 'object' || Array.isArray(bindings)) throw new Error('Invalid state contract')
      const hasBinding = Object.hasOwn(bindings, sessionId)
      return { status: hasBinding && bindings[sessionId] === entryId ? 'owned' : 'not-owned', via: 'version-scoped-readonly-fallback' }
    } catch { return { status: 'unavailable', reason: 'legacy-state-unavailable' } }
  }
  // Keep historical sessions intact; caller should show retry, not auto-create replacement sessions.
  return { status: 'unavailable', reason: knownGuard ? 'service-context-guard' : 'service-failure' }
}
