/**
 * Sandbox-consuming Niubash executor — the Niubash twin of
 * `@deepseek-ai/dsh-pwsh-sandbox` (and through it of
 * `@deepseek-ai/dsh-bash-sandbox`). It wraps the exact local niu argv through
 * `ctx.sandbox`, inherits local process mechanics, and reports the selected
 * mode, enforcement, and denial facts.
 * @module @cmx666/dsh-winuxsh-sandbox
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ShellExecRequest, ShellExecSpec, ShellProcess, ShellRunResult } from '@deepseek-ai/dsh-shell'
import type { ConfinedArgv, RunnerFailureRule, SandboxMode, SandboxPolicy } from '@deepseek-ai/dsh-sandbox'
import type { WinuxshLocalExecutor, Config as LocalConfig } from '@cmx666/dsh-winuxsh-local'

/** Plugin config: the local executor's knobs, verbatim. */
export type Config = LocalConfig

/**
 * Attribute only Node ENOENT/EACCES failures with positive argv[0]
 * provenance after independently ruling out the caller-owned cwd.
 */
export function isRunnerSpawnFailure(
  error: unknown,
  runnerProgram: string | undefined,
  workdir: string,
): boolean

/** Classify a failed run against the selected backend's denial dialect. */
export function classifyDenial(result: ShellRunResult, signatures: readonly string[]): boolean

/**
 * Classify one settled process against the selected backend's structured
 * runner-failure rules.
 * @returns the first matching fatal line, or undefined when evidence is insufficient.
 */
export function classifyRunnerFailure(
  exitCode: number | null,
  stderr: string,
  rules: readonly RunnerFailureRule[],
): { detail: string } | undefined

/** Match a non-zero exit against case-insensitive stderr signatures. */
export function matchesSignature(exitCode: number | null, stderr: string, signatures: readonly string[]): boolean

/**
 * Registers as `ctx.shell` in place of the local Niubash executor and requires
 * a `ctx.sandbox` provider plus `ctx.sandboxPolicy`. Positive runner-launch
 * evidence means the command never ran: foreground calls throw
 * `SandboxUnavailableError`, background processes carry `runnerFailed`.
 */
export class SandboxWinuxshExecutor extends WinuxshLocalExecutor {
  static inject: ['subprocess', 'sandbox', 'sandboxPolicy']

  constructor(ctx: Context, config: Config)

  /** The configured default mode — the capability fact the tool layer reads. */
  get sandboxMode(): SandboxMode

  /** Stamp a complete per-call policy onto the spec. */
  resolve(request: ShellExecRequest): ShellExecSpec

  run(spec: ShellExecSpec): Promise<ShellRunResult>

  start(spec: ShellExecSpec): ShellProcess

  protected onProcessDone(proc: ShellProcess, stderr: string, spawnFailed: boolean, spawnError?: unknown): void

  /** Wrap one winuxsh invocation via the `ctx.sandbox` provider. */
  protected confine(spec: ShellExecSpec, policy: SandboxPolicy): ConfinedArgv
}

export default SandboxWinuxshExecutor
