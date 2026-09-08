/**
 * Package-owned invariant companion for `@cmx666/dsh-winuxsh-sandbox`.
 * @module @cmx666/dsh-winuxsh-sandbox/invariant
 */

import type { Context } from '@deepseek-ai/cordis'

/** Cordis companion plugin name. */
export const name: 'winuxsh-sandbox-invariant'

/** Service required before the companion can reserve package ownership. */
export const inject: ['invariants']

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply: (ctx: Context) => Promise<() => void>
