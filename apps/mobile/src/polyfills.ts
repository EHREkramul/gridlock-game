/**
 * Runs before any app code (see index.ts).
 *
 * @colyseus/schema creates a FinalizationRegistry at module load. It only backs
 * up server-side StateView cleanup, but Hermes does not implement it, so the
 * import would crash. A no-op stand-in is safe for a client.
 */
const g = globalThis as { FinalizationRegistry?: unknown };
if (typeof g.FinalizationRegistry === 'undefined') {
  g.FinalizationRegistry = class {
    register() {}
    unregister() {
      return false;
    }
  };
}
