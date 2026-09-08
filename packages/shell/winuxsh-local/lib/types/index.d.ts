/**
 * Local Niubash Service Provider for the bash capability seam.
 * @module @cmx666/dsh-winuxsh-local
 */

import type { Context } from '@deepseek-ai/cordis'
import type { PwshLocalExecutor, Config as PwshConfig, ResolvedConfig } from '@deepseek-ai/dsh-pwsh-local'
import type { ShellExecSpec } from '@deepseek-ai/dsh-shell'

/** Plugin config (all optional — `static Config` supplies the defaults). */
export interface Config {
  /** Default working directory for commands (default: process.cwd()). */
  cwd?: string
  /** Default foreground timeout in milliseconds. */
  timeoutMs?: number
  /** Upper bound for per-call timeout overrides. */
  maxTimeoutMs?: number
  /** Per-stream in-memory output cap; overflow spills to a temp file. */
  maxOutputBytes?: number
  /** Per-stream spill-file cap; larger streams retain only their in-memory tail. */
  maxSpillBytes?: number
  /** Grace period for kill escalation and inherited pipes; at most `MAX_TIMER_DELAY_MS`. */
  graceMs?: number
  /**
   * Explicit winuxsh executable. When omitted, PATH entries are probed in
   * order for `niu[.exe]` (preferred globally), then legacy `winuxsh[.exe]`,
   * falling back to a bare `niu` resolved through PATH.
   */
  winuxshPath?: string
}

/** The shape after schemastery applied the defaults (cwd/winuxshPath have none). */
export type ResolvedWinuxshConfig = Required<Omit<Config, 'cwd' | 'winuxshPath'>> & Pick<Config, 'cwd' | 'winuxshPath'>

/**
 * PATH-derived winuxsh executable candidates, platform-named: every PATH
 * entry's `niu[.exe]` first, then every entry's legacy `winuxsh[.exe]`, so a
 * stale `winuxsh.exe` in an earlier PATH entry never shadows a later entry's
 * `niu.exe`.
 */
export function candidateWinuxshPaths(env?: NodeJS.ProcessEnv, platform?: NodeJS.Platform): string[]

/**
 * Resolve the winuxsh executable this executor spawns: the configured path
 * verbatim, else the first existing PATH candidate (Niubash `niu[.exe]`
 * preferred globally, legacy `winuxsh[.exe]` fallback), else a bare `niu`
 * for PATH resolution.
 */
export function resolveWinuxshPath(
  configured?: string,
  env?: NodeJS.ProcessEnv,
  platform?: NodeJS.Platform,
): string

/**
 * Local Niubash executor over `ctx.subprocess` — the Niubash twin of
 * `PwshLocalExecutor`. All process mechanics (bounded spill-backed output,
 * deadlines, kill escalation, background handles) are inherited; this subclass
 * supplies the winuxsh executable resolution, the `-c` argv, the bash-like
 * model-friendly environment, and winuxsh-branded diagnostics.
 */
export class WinuxshLocalExecutor extends PwshLocalExecutor {
  static Config: Config

  constructor(ctx: Context, config: Config)

  protected readonly diagnosticPrefix: 'winuxsh-local'

  protected assertServiceable(config: PwshConfig): void

  protected declaredExecutable(config: ResolvedConfig): string | undefined

  protected resolveExecutable(declared: string | undefined): string

  /** The winuxsh executable every command runs through. */
  get winuxshPath(): string

  protected envOverrides(): Readonly<Record<string, string>>

  /** The winuxsh invocation argv for one resolved spec. */
  protected argv(spec: ShellExecSpec): string[]
}

export default WinuxshLocalExecutor
