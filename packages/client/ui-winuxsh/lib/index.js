/**
 * Package entry for `@cmx666/dsh-client-ui-winuxsh`.
 *
 * `client.js` is a browser module: importing it runs
 * `window.__ModuleLoader__.load(...)` to register the settings card with the
 * DSH web client. That top-level `window` access throws in Node, so this
 * entry registers the card ONLY in a browser that has the module loader, and
 * resolves to a plain descriptor elsewhere (npm installs, bundle metadata
 * reads, SSR preloads).
 *
 * @module @cmx666/dsh-client-ui-winuxsh
 */

const browser = typeof window !== 'undefined' && window.__ModuleLoader__ !== undefined

if (browser) {
  // Top-level await keeps the static shape while never touching `window` in Node.
  await import('./client.js')
}

export default { id: '@cmx666/dsh-client-ui-winuxsh', registered: browser }
