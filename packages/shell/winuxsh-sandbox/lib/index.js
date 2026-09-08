/**
 * Sandbox-consuming Niubash executor — the Niubash twin of
 * `@deepseek-ai/dsh-pwsh-sandbox` (and through it of
 * `@deepseek-ai/dsh-bash-sandbox`). It wraps the exact local niu argv
 * through `ctx.sandbox` (which on Windows resolves to the ACL restricted-token
 * runner chain), inherits local process mechanics, and reports the selected
 * mode, enforcement, and denial facts. Positive runner-launch evidence means
 * the command never ran: foreground calls throw `SANDBOX_UNAVAILABLE`, while
 * background processes carry `runnerFailed`; other spawn rejections retain
 * local-executor semantics. The tool layer owns the escalation approval flow
 * through `ctx.approval`; this executor reports the sandbox facts the tool
 * renders.
 *
 * Hand-synced JS build of `src/index.ts` + `src/helpers.ts` — keep the two in
 * lockstep; the suites exercise this artifact through the package name so a
 * drift fails the build.
 *
 * @module @cmx666/dsh-winuxsh-sandbox
 */

import { accessSync, constants, statSync } from 'node:fs'
import { SandboxUnavailableError } from '@deepseek-ai/dsh-sandbox'
import { WinuxshLocalExecutor } from '@cmx666/dsh-winuxsh-local'

/** Node-local spawn codes proven to identify executable resolution or permission failure. */
const EXECUTABLE_SPAWN_CODES = new Set(['EACCES', 'ENOENT'])

/** Whether the caller-owned spawn cwd can be entered. */
function isUsableWorkdir(path) {
  try {
    if (!statSync(path).isDirectory()) return false
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

/**
 * Attribute only Node ENOENT/EACCES failures with positive argv[0] provenance
 * after independently ruling out the caller-owned cwd. A supplied error path
 * must exactly identify the runner; without one, the syscall must. With a
 * usable cwd, these codes describe resolution or execute permission for that
 * argv[0] or its shebang interpreter.
 * @param {unknown} error - the original spawn rejection.
 * @param {string | undefined} runnerProgram - provider argv[0], the executable that establishes confinement.
 * @param {string} workdir - the caller-owned spawn cwd, checked independently for usability.
 * @returns {boolean} whether the rejection has executable-specific runner evidence.
 */
function isRunnerSpawnFailure(error, runnerProgram, workdir) {
  if (runnerProgram === undefined || !isUsableWorkdir(workdir)) return false
  if (typeof error !== 'object' || error === null) return false
  const { code, path, syscall } = error
  if (typeof code !== 'string' || !EXECUTABLE_SPAWN_CODES.has(code)) return false
  if (typeof syscall !== 'string') return false
  const exactSyscall = `spawn ${runnerProgram}`
  if (path === undefined) return syscall === exactSyscall
  if (typeof path !== 'string' || path.length === 0 || path !== runnerProgram) return false
  return syscall === 'spawn' || syscall === exactSyscall
}

/**
 * Classify a failed run against the selected backend's denial dialect.
 * @param {import('@deepseek-ai/dsh-shell').ShellRunResult} result - settled foreground run.
 * @param {readonly string[]} signatures - case-insensitive denial substrings from the active wrap.
 * @returns {boolean} whether the failed run matches that denial dialect.
 */
function classifyDenial(result, signatures) {
  return matchesSignature(result.exitCode, result.stderr.text, signatures)
}

/**
 * Classify one settled process against the selected backend's structured
 * runner-failure rules. Each rule requires a nonzero exit, its optional
 * exit-code gate, and a fatal signature on one stderr line after exact
 * informational lines are excluded.
 * @param {number | null} exitCode - process exit code; null means signal termination.
 * @param {string} stderr - collected stderr text, left unchanged.
 * @param {readonly import('@deepseek-ai/dsh-sandbox').RunnerFailureRule[]} rules - structured runner-failure rules from the active wrap.
 * @returns {{ detail: string } | undefined} the first matching fatal line, or undefined when evidence is insufficient.
 */
function classifyRunnerFailure(exitCode, stderr, rules) {
  if (exitCode === null || exitCode === 0) return undefined
  const lines = stderr.split(/\r?\n/)
  for (const rule of rules) {
    if (rule.allowedExitCodes !== undefined && !rule.allowedExitCodes.includes(exitCode)) continue
    const informationalLines = new Set((rule.informationalLines ?? []).map(line => line.toLowerCase()))
    // An empty or whitespace-only substring is not meaningful runner evidence.
    // Ignore it while keeping any valid signatures beside it active.
    const fatalSignatures = rule.fatalSignatures
      .filter(signature => signature.trim().length > 0)
      .map(signature => signature.toLowerCase())
    for (const line of lines) {
      const lowered = line.toLowerCase()
      if (informationalLines.has(lowered)) continue
      if (fatalSignatures.some(signature => lowered.includes(signature))) return { detail: line }
    }
  }
  return undefined
}

/**
 * Match a non-zero exit against case-insensitive stderr signatures.
 * @param {number | null} exitCode - process exit code; null means signal termination.
 * @param {string} stderr - collected stderr text.
 * @param {readonly string[]} signatures - substrings identifying the selected backend's dialect.
 * @returns {boolean} whether this is a non-zero exit whose stderr matches a signature.
 */
function matchesSignature(exitCode, stderr, signatures) {
  if (exitCode === null || exitCode === 0) return false
  const lowered = stderr.toLowerCase()
  return signatures.some(signature => lowered.includes(signature.toLowerCase()))
}

/**
 * Registers as `ctx.shell` in place of the local Niubash executor and requires
 * a `ctx.sandbox` provider plus `ctx.sandboxPolicy`; the tool layer carries the
 * sandbox denial rendering and escalation surface. Tool calls pass the calling
 * session's resolved policy; direct calls fall back to deployment policy.
 * `result.sandbox` reports the mode, enforcement, and denial facts the tool
 * renders.
 */
/* jscpd:ignore-start -- deliberate call-for-call mirror of bash/pwsh-sandbox's executor */
class SandboxWinuxshExecutor extends WinuxshLocalExecutor {
  static inject = ['subprocess', 'sandbox', 'sandboxPolicy']

  // No own Config: the sandbox default (mode + workspaceRoot) moved to
  // ctx.sandboxPolicy, so this executor inherits WinuxshLocalExecutor's Config
  // verbatim (the config catalog walks the inherited static).
  //
  // Plain (non-#) private shape: cordis wraps plugin methods and re-applies
  // them with a proxy receiver, which breaks true private members.

  /**
   * Per-process confinement facts retained until settlement. Providers may
   * vary enforcement and diagnostic dialect between overlapping calls, so a
   * shared latest-wrap value would classify a process against the wrong facts.
   * Unconfined processes have no entry.
   */
  _processFacts = new Map()

  constructor(ctx, config) {
    super(ctx, config)
    // The default mode is the capability fact used for schema advertisement;
    // actual tool executions carry their resolved per-call policy.
    this._mode = ctx.sandboxPolicy.defaultMode
  }

  /** The configured default mode — the capability fact the tool layer reads. */
  get sandboxMode() {
    return this._mode
  }

  /**
   * Stamp a complete per-call policy onto the spec. Tool calls supply the
   * calling session's resolved mode and root; lower-level callers fall back to
   * the deployment policy.
   */
  resolve(request) {
    return { ...super.resolve(request), sandboxPolicy: request.sandboxPolicy ?? this.ctx.sandboxPolicy.resolve() }
  }

  async run(spec) {
    const policy = spec.sandboxPolicy
    const { mode } = policy
    if (mode === 'danger-full-access') {
      const result = await super.run(spec)
      return { ...result, sandbox: { mode, denied: false } }
    }
    const confined = this._confine(spec, { ...policy, mode })
    let result
    try {
      result = await this.runArgv(spec, confined.argv)
    } catch (error) {
      // An upstream abort remains cancellation even when it prevents spawn.
      if (spec.signal?.aborted === true) spec.signal.throwIfAborted()
      if (isRunnerSpawnFailure(error, confined.argv[0], spec.workdir)) {
        throw new SandboxUnavailableError(mode, String(error))
      }
      throw error
    }
    // Runner failure outranks denial because the command did not run. Carry
    // the matched fatal line, not an informational line that preceded it.
    const runnerFailure = classifyRunnerFailure(result.exitCode, result.stderr.text, confined.runnerFailureRules)
    if (runnerFailure !== undefined) {
      throw new SandboxUnavailableError(mode, runnerFailure.detail)
    }
    return { ...result, sandbox: { mode, denied: classifyDenial(result, confined.denialSignatures), enforcement: confined.enforcement } }
  }

  start(spec) {
    const policy = spec.sandboxPolicy
    const { mode } = policy
    if (mode === 'danger-full-access') return super.start(spec)
    // Once startArgv returns, install facts synchronously; promise settlement
    // cannot run before start() returns.
    const confined = this._confine(spec, { ...policy, mode })
    let proc
    try {
      proc = this.startArgv(spec, confined.argv)
    } catch (error) {
      if (isRunnerSpawnFailure(error, confined.argv[0], spec.workdir)) {
        throw new SandboxUnavailableError(mode, String(error))
      }
      throw error
    }
    const { enforcement, denialSignatures, runnerFailureRules } = confined
    this._processFacts.set(proc, {
      mode,
      enforcement,
      denialSignatures,
      runnerFailureRules,
      runnerProgram: confined.argv[0],
      workdir: spec.workdir,
    })
    return proc
  }

  /**
   * Stamp per-process sandbox facts before `done` settles. Full-access
   * processes have no facts; signal deaths are not denials.
   */
  onProcessDone(proc, stderr, spawnFailed, spawnError) {
    const facts = this._processFacts.get(proc)
    if (facts !== undefined) {
      this._processFacts.delete(proc)
      // A rejected spawn never started the confined launch. Otherwise runner
      // failure outranks denial because its diagnostics may contain denial terms.
      const runnerFailed = spawnFailed
        ? isRunnerSpawnFailure(spawnError, facts.runnerProgram, facts.workdir)
        : classifyRunnerFailure(proc.exitCode, stderr, facts.runnerFailureRules) !== undefined
      proc.sandbox = {
        mode: facts.mode,
        denied: !runnerFailed && matchesSignature(proc.exitCode, stderr, facts.denialSignatures),
        enforcement: facts.enforcement,
        ...(runnerFailed ? { runnerFailed } : {}),
      }
    }
    super.onProcessDone(proc, stderr, spawnFailed, spawnError)
  }

  /**
   * Wrap one winuxsh invocation via the `ctx.sandbox` provider. Provider errors
   * propagate unchanged; the returned argv is handed directly to the local
   * executor's subprocess path.
   */
  _confine(spec, policy) {
    return this.ctx.sandbox.confine(this.argv(spec), policy)
  }
}
/* jscpd:ignore-end */

export { SandboxWinuxshExecutor, classifyDenial, classifyRunnerFailure, isRunnerSpawnFailure, matchesSignature }
export default SandboxWinuxshExecutor
