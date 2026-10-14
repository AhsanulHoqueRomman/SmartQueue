/** Latest-started request wins; changing scope/unmount invalidates every ticket. */
export function createRequestScope(initialKey = '') {
  let key = initialKey;
  let revision = 0;
  let active = true;
  let backgroundPending = false;
  return {
    setKey(next) { if (next !== key) { key = next; revision += 1; backgroundPending = false; } },
    begin(expectedKey = key, { background = false } = {}) {
      if (!active || expectedKey !== key || (background && backgroundPending)) return null;
      backgroundPending = background;
      return { key, revision: ++revision };
    },
    finish(ticket) { if (this.isCurrent(ticket)) backgroundPending = false; },
    isCurrent(ticket) { return Boolean(active && ticket && ticket.key === key && ticket.revision === revision); },
    isCurrentScope(ticket) { return Boolean(active && ticket && ticket.key === key); },
    invalidate() { revision += 1; backgroundPending = false; },
    deactivate() { active = false; revision += 1; backgroundPending = false; },
    activate() { active = true; },
  };
}
