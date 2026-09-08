/**
 * Local Niubash Service Provider for the bash capability seam. Each command
 * runs as `<niu> -c <command>` in a managed process spawned through
 * `ctx.subprocess`, with the PowerShell executor family's process lifecycle,
 * output collection, deadlines, cause classification, and model-friendly
 * environment inherited from `@deepseek-ai/dsh-pwsh-local`. Niubash is a
 * Windows-native bash-compatible shell with a `-c` command domain: the
 * command string is passed as ONE argv element and niu parses the text
 * itself, so no intermediate shell exists and there is no shell-quoting layer
 * to escape.
 *
 * The published `@deepseek-ai/dsh-pwsh-local` base exposes exactly three
 * overridable seams — the constructor's config entry, `argv()`, and
 * `spawnSpec()` — so this subclass maps `winuxshPath` onto the base's
 * `pwshPath` config field (pre-resolved through PATH) and re-points those
 * seams at niu. Numeric config validation runs here first with
 * winuxsh-branded messages; the base re-validates with its own prefix.
 *
 * Hand-synced JS build of `src/index.ts` + `src/resolve.ts` — keep the two in
 * lockstep; the suites exercise this artifact through the package name so a
 * drift fails the build.
 *
 * @module @cmx666/dsh-winuxsh-local
 */

import { lstatSync } from 'node:fs'
import { join } from 'node:path'
import { ENV_OVERRIDES, PwshLocalExecutor } from '@deepseek-ai/dsh-pwsh-local'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import Schema from '@deepseek-ai/schemastery'

/**
 * PATH-derived winuxsh executable candidates, platform-named. Niubash ships
 * as `niu[.exe]`; discovery probes every PATH entry for `niu[.exe]` first and
 * falls back to the legacy `winuxsh[.exe]`, so a stale `winuxsh.exe` in an
 * earlier PATH entry never shadows a later entry's `niu.exe`.
 * Pure function of (env, platform) on every platform.
 * @param {NodeJS.ProcessEnv} [env] - the environment to probe; defaults to the process environment.
 * @param {NodeJS.Platform} [platform] - the platform to resolve for; defaults to the process platform.
 * @returns {string[]} candidate paths in resolution order: every PATH entry's
 *          `niu[.exe]` first, then every entry's legacy `winuxsh[.exe]`.
 */
function candidateWinuxshPaths(env = process.env, platform = process.platform) {
  const niuName = platform === 'win32' ? 'niu.exe' : 'niu'
  const wshName = platform === 'win32' ? 'winuxsh.exe' : 'winuxsh'
  const delimiter = platform === 'win32' ? ';' : ':'
  const niuCandidates = []
  const wshCandidates = []
  // PATH entries may carry surrounding quotes from `setx`-style definitions.
  for (const entry of (env.PATH ?? '').split(delimiter)) {
    const trimmed = entry.trim().replace(/^"|"$/g, '')
    if (trimmed.length === 0) continue
    niuCandidates.push(join(trimmed, niuName))
    wshCandidates.push(join(trimmed, wshName))
  }
  return [...niuCandidates, ...wshCandidates]
}

/**
 * Whether a candidate can be spawned. lstat opens the entry itself instead of
 * following reparse points, so it sees a Windows app execution alias where
 * stat hits the target's ACL (EACCES); Node reports that alias as a symlink
 * on current releases and as a plain file on older ones, and CreateProcess
 * resolves either shape. A real directory never matches.
 */
function candidateExists(candidate) {
  try {
    const stat = lstatSync(candidate)
    return stat.isFile() || stat.isSymbolicLink()
  } catch {
    return false
  }
}

/**
 * Resolve the winuxsh executable this executor spawns.
 * @param {string | undefined} configured - an explicit `winuxshPath` config value, trusted as-is.
 * @param {NodeJS.ProcessEnv} [env] - the environment to probe; defaults to the process environment.
 * @param {NodeJS.Platform} [platform] - the platform to resolve for; defaults to the process platform.
 * @returns {string} the configured path verbatim, else the first existing PATH
 *          candidate (Niubash `niu[.exe]` preferred globally, legacy
 *          `winuxsh[.exe]` fallback), else a bare `niu` for PATH resolution.
 */
function resolveWinuxshPath(configured, env = process.env, platform = process.platform) {
  if (configured !== undefined && configured.length > 0) return configured
  for (const candidate of candidateWinuxshPaths(env, platform)) {
    if (candidateExists(candidate)) return candidate
  }
  return 'niu'
}

/**
 * Reject a resolved numeric budget this executor could not run with. The
 * schema expresses neither "positive and finite" nor the timer bound `graceMs`
 * has to fit, so a stored value is refused where it is written instead of
 * failing at the next command. Winuxsh-branded: the base executor would
 * report the same facts under its own `pwsh-local` prefix.
 */
function assertWinuxshConfig(config) {
  for (const name of ['timeoutMs', 'maxTimeoutMs', 'maxOutputBytes', 'maxSpillBytes', 'graceMs']) {
    const value = config[name]
    if (!Number.isFinite(value) || value <= 0) throw new Error(`winuxsh-local: ${name} must be a positive finite number`)
  }
  if (config.graceMs > MAX_TIMER_DELAY_MS) throw new Error(`winuxsh-local: graceMs must be no greater than ${MAX_TIMER_DELAY_MS}`)
}

/**
 * Local Niubash executor over `ctx.subprocess` — the Niubash twin of
 * `PwshLocalExecutor`. All process mechanics (bounded spill-backed output,
 * deadlines, kill escalation, background handles) are inherited; this
 * subclass supplies the winuxsh executable resolution, the `-c` argv, the
 * bash-like model-friendly environment, and winuxsh-branded diagnostics.
 */
class WinuxshLocalExecutor extends PwshLocalExecutor {
  static Config = Schema.object({
    cwd: Schema.string(),
    timeoutMs: Schema.number().default(120_000),
    maxTimeoutMs: Schema.number().default(600_000),
    maxOutputBytes: Schema.number().default(64_000),
    maxSpillBytes: Schema.number().default(64 * 1024 * 1024),
    graceMs: Schema.number().default(3_000),
    winuxshPath: Schema.string(),
  })

  constructor(ctx, config) {
    const declared = config?.winuxshPath
    const pwshPath = resolveWinuxshPath(declared)
    if (config !== undefined) assertWinuxshConfig(config)
    super(ctx, { ...config, pwshPath })
    /** The declared winuxshPath the current resolved executable came from. */
    this.declaredWinuxshPath = declared
    /** The winuxsh executable resolved from the current config. */
    this.resolvedWinuxshPath = pwshPath
  }

  /**
   * The winuxsh executable every command runs through. Re-resolves when a
   * stored `winuxshPath` differs from the one the current executable was
   * resolved from, so an unrelated settings change never re-probes the
   * filesystem. (schemastery preserves the unknown-to-the-base `winuxshPath`
   * key through the settings layer, which is what makes this readable.)
   */
  get winuxshPath() {
    const declared = this.config?.winuxshPath
    if (declared !== this.declaredWinuxshPath) {
      this.declaredWinuxshPath = declared
      this.resolvedWinuxshPath = resolveWinuxshPath(declared)
    }
    return this.resolvedWinuxshPath
  }

  /**
   * Resolve a request into a fully-specified spec, with winuxsh-branded
   * messages for the per-call overrides the base re-checks under its own.
   */
  resolve(request) {
    if (request.timeoutMs !== undefined && (!Number.isFinite(request.timeoutMs) || request.timeoutMs <= 0)) {
      throw new Error('winuxsh-local: request.timeoutMs must be a positive finite number')
    }
    if (request.stdoutMaxBytes !== undefined && (!Number.isFinite(request.stdoutMaxBytes) || request.stdoutMaxBytes <= 0)) {
      throw new Error('winuxsh-local: request.stdoutMaxBytes must be a positive finite number')
    }
    return super.resolve(request)
  }

  /**
   * The niu invocation argv for one resolved spec — the argv-level seam a
   * confining subclass wraps through `ctx.sandbox.confine` (see
   * `@cmx666/dsh-winuxsh-sandbox`).
   */
  argv(spec) {
    return [this.winuxshPath, '-c', spec.command]
  }

  /**
   * Map the spec onto the subprocess spawn, adding the bash-dialect terminal
   * marker to the base's model-friendly environment (`TERM=dumb` is a POSIX
   * concept, so winuxsh — unlike pwsh — honors it).
   */
  spawnSpec(spec, stdoutMaxBytes, signal, argv) {
    const mapped = super.spawnSpec(spec, stdoutMaxBytes, signal, argv)
    return { ...mapped, env: { ...mapped.env, TERM: 'dumb' } }
  }
}

export { WinuxshLocalExecutor, assertWinuxshConfig, candidateWinuxshPaths, resolveWinuxshPath }
export default WinuxshLocalExecutor
