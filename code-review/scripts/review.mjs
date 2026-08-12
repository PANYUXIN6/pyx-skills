#!/usr/bin/env node

import {
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { createHash } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const SCRIPT_FILE = fileURLToPath(import.meta.url)
const SKILL_DIRECTORY = path.resolve(path.dirname(SCRIPT_FILE), '..')
const FINDINGS_SCHEMA = JSON.parse(
  readFileSync(path.join(SKILL_DIRECTORY, 'references', 'findings.schema.json'), 'utf8'),
)
const SCHEMA_VERSION = FINDINGS_SCHEMA.properties.schema_version.const
const BLOCKING_SEVERITIES = new Set(['P0', 'P1', 'P2'])
const MAX_REVIEW_BYTES = 8 * 1024 * 1024
const LOCK_WAIT_MILLISECONDS = 10_000
const LOCK_POLL_MILLISECONDS = 25
const LOCK_INITIALIZATION_GRACE_MILLISECONDS = 1_000
const WAIT_BUFFER = new Int32Array(new SharedArrayBuffer(4))

class ReviewRuntimeError extends Error {
  constructor(code, message, details = undefined) {
    super(message)
    this.code = code
    this.details = details
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableValue(value[key])]),
    )
  }
  return value
}

function stableJson(value) {
  return JSON.stringify(stableValue(value))
}

function atomicWriteJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true })
  const temporaryPath = `${filePath}.${process.pid}.tmp`
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`)
  renameSync(temporaryPath, filePath)
}

function processIsAlive(processId) {
  try {
    process.kill(processId, 0)
    return true
  } catch (error) {
    return error.code !== 'ESRCH'
  }
}

function withRunLock(runDirectory, operation) {
  const resolvedRun = realpathSync(runDirectory)
  const lockPath = path.join(resolvedRun, '.state.lock')
  const candidateLockPath = `${lockPath}.${process.pid}.${Date.now()}`
  writeFileSync(candidateLockPath, `${process.pid}\n`, { flag: 'wx', mode: 0o600 })
  const deadline = Date.now() + LOCK_WAIT_MILLISECONDS
  try {
    while (true) {
      try {
        linkSync(candidateLockPath, lockPath)
        break
      } catch (error) {
        if (error.code !== 'EEXIST') throw error
        let owner = null
        let lockAge = 0
        try {
          const ownerText = readFileSync(lockPath, 'utf8').trim()
          if (/^[1-9]\d*$/.test(ownerText)) {
            const parsedOwner = Number(ownerText)
            if (Number.isSafeInteger(parsedOwner)) owner = parsedOwner
          }
          lockAge = Date.now() - statSync(lockPath).mtimeMs
        } catch {
          // A malformed or concurrently replaced lock is handled after the grace period.
        }
        const staleLock =
          (owner !== null && !processIsAlive(owner)) ||
          (owner === null && lockAge >= LOCK_INITIALIZATION_GRACE_MILLISECONDS)
        if (staleLock) {
          try {
            unlinkSync(lockPath)
            continue
          } catch (unlinkError) {
            if (unlinkError.code !== 'ENOENT') throw unlinkError
          }
        }
        if (Date.now() >= deadline) {
          throw new ReviewRuntimeError('RUN_BUSY', 'Review run 正在被另一个进程修改')
        }
        Atomics.wait(WAIT_BUFFER, 0, 0, LOCK_POLL_MILLISECONDS)
      }
    }
  } finally {
    try {
      unlinkSync(candidateLockPath)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }
  try {
    return operation(resolvedRun)
  } finally {
    try {
      unlinkSync(lockPath)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }
}

function readJson(filePath, label) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch (error) {
    throw new ReviewRuntimeError(
      'INVALID_JSON',
      `${label} 不是有效 JSON：${filePath}`,
      { cause: error.message },
    )
  }
}

function runGit(repository, args, options = {}) {
  const result = spawnSync('git', ['-c', 'core.fsmonitor=false', '-C', repository, ...args], {
    encoding: null,
    input: options.input,
    maxBuffer: 64 * 1024 * 1024,
  })
  const allowedStatuses = options.allowedStatuses ?? [0]
  if (result.error || !allowedStatuses.includes(result.status)) {
    throw new ReviewRuntimeError(
      'GIT_COMMAND_FAILED',
      `Git 命令失败：git -C <repository> ${args.join(' ')}`,
      {
        exit_code: result.status,
        stderr: result.stderr?.toString('utf8').trim() ?? result.error?.message,
      },
    )
  }
  return result.stdout ?? Buffer.alloc(0)
}

function gitText(repository, args) {
  return runGit(repository, args).toString('utf8').trim()
}

function gitRepositoryRoot(candidate) {
  const resolved = realpathSync(candidate)
  return realpathSync(gitText(resolved, ['rev-parse', '--show-toplevel']))
}

function toPosix(value) {
  return value.split(path.sep).join('/')
}

function normalizeRelativePath(repository, candidate, requireExisting = true) {
  if (typeof candidate !== 'string' || candidate.length === 0) {
    throw new ReviewRuntimeError('INVALID_PATH', '文件路径不能为空')
  }
  const absolute = path.resolve(repository, candidate)
  const relative = path.relative(repository, absolute)
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new ReviewRuntimeError('PATH_OUTSIDE_REPOSITORY', `路径位于仓库外：${candidate}`)
  }
  if (requireExisting) {
    if (!existsSync(absolute)) {
      throw new ReviewRuntimeError('PATH_NOT_FOUND', `文件不存在：${candidate}`)
    }
    const real = realpathSync(absolute)
    const realRelative = path.relative(repository, real)
    if (
      realRelative === '..' ||
      realRelative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(realRelative)
    ) {
      throw new ReviewRuntimeError('SYMLINK_OUTSIDE_REPOSITORY', `符号链接指向仓库外：${candidate}`)
    }
  }
  return toPosix(relative)
}

function splitNull(buffer) {
  const text = buffer.toString('utf8')
  const parts = text.split('\0')
  if (parts.at(-1) === '') parts.pop()
  return parts
}

function parseNameStatus(buffer) {
  const fields = splitNull(buffer)
  const changes = []
  for (let index = 0; index < fields.length; ) {
    const rawStatus = fields[index++]
    if (!rawStatus) continue
    const kind = rawStatus[0]
    if (kind === 'R' || kind === 'C') {
      const oldPath = fields[index++]
      const newPath = fields[index++]
      if (!oldPath || !newPath) {
        throw new ReviewRuntimeError('INVALID_GIT_OUTPUT', '无法解析 Git rename/copy 输出')
      }
      changes.push({
        change_type: kind === 'C' ? 'A' : 'R',
        old_path: oldPath,
        path: newPath,
      })
      continue
    }
    const filePath = fields[index++]
    if (!filePath) {
      throw new ReviewRuntimeError('INVALID_GIT_OUTPUT', '无法解析 Git name-status 输出')
    }
    changes.push({
      change_type: ['A', 'M', 'D', 'T'].includes(kind) ? kind : 'M',
      old_path: null,
      path: filePath,
    })
  }
  return changes
}

function unavailableInput() {
  return { buffer: null, excluded_reason: null, observed_size_bytes: null }
}

function oversizedInput(size) {
  return { buffer: null, excluded_reason: 'file_too_large', observed_size_bytes: size }
}

function availableInput(buffer) {
  return { buffer, excluded_reason: null, observed_size_bytes: buffer.length }
}

function readWorkingTreeInput(repository, relativePath) {
  const absolute = path.join(repository, relativePath)
  if (!existsSync(absolute)) return unavailableInput()
  const stat = lstatSync(absolute)
  if (stat.isSymbolicLink()) return availableInput(Buffer.from(readlinkSync(absolute), 'utf8'))
  if (!stat.isFile()) return unavailableInput()
  if (stat.size > MAX_REVIEW_BYTES) return oversizedInput(stat.size)
  return availableInput(readFileSync(absolute))
}

function readWorkingTreeFile(repository, relativePath) {
  return readWorkingTreeInput(repository, relativePath).buffer
}

function entryMetadataFromMode(gitMode) {
  if (!gitMode) return null
  return {
    git_mode: gitMode,
    file_type:
      gitMode === '120000'
        ? 'symlink'
        : gitMode === '160000'
          ? 'gitlink'
          : gitMode.startsWith('100')
            ? 'file'
            : 'other',
  }
}

function readWorkingTreeMetadata(repository, relativePath) {
  const absolute = path.join(repository, relativePath)
  if (!existsSync(absolute)) return null
  const stat = lstatSync(absolute)
  if (stat.isSymbolicLink()) return entryMetadataFromMode('120000')
  if (stat.isFile()) return entryMetadataFromMode(stat.mode & 0o111 ? '100755' : '100644')
  return { git_mode: null, file_type: 'other' }
}

function parseTreeMode(buffer) {
  const match = buffer.toString('utf8').match(/^(\d{6})\s/)
  return entryMetadataFromMode(match?.[1] ?? null)
}

function readGitMetadata(repository, commit, relativePath) {
  if (!commit || !relativePath) return null
  return parseTreeMode(runGit(repository, ['ls-tree', '-z', commit, '--', relativePath]))
}

function readIndexMetadata(repository, relativePath) {
  if (!relativePath) return null
  return parseTreeMode(runGit(repository, ['ls-files', '--stage', '-z', '--', relativePath]))
}

function readGitObjectInput(repository, object) {
  if (!object) return unavailableInput()
  const sizeResult = spawnSync(
    'git',
    ['-c', 'core.fsmonitor=false', '-C', repository, 'cat-file', '-s', object],
    { encoding: 'utf8', maxBuffer: 1024 * 1024 },
  )
  if (sizeResult.status !== 0) return unavailableInput()
  const size = Number(sizeResult.stdout.trim())
  if (!Number.isSafeInteger(size) || size < 0) return unavailableInput()
  if (size > MAX_REVIEW_BYTES) return oversizedInput(size)
  const result = spawnSync(
    'git',
    ['-c', 'core.fsmonitor=false', '-C', repository, 'show', object],
    {
      encoding: null,
      maxBuffer: MAX_REVIEW_BYTES + 1024,
    },
  )
  if (result.status !== 0) return unavailableInput()
  return availableInput(result.stdout ?? Buffer.alloc(0))
}

function readGitBlobInput(repository, commit, relativePath) {
  return !commit || !relativePath
    ? unavailableInput()
    : readGitObjectInput(repository, `${commit}:${relativePath}`)
}

function readGitBlob(repository, commit, relativePath) {
  return readGitBlobInput(repository, commit, relativePath).buffer
}

function readIndexBlobInput(repository, relativePath) {
  return relativePath ? readGitObjectInput(repository, `:${relativePath}`) : unavailableInput()
}

function readIndexBlob(repository, relativePath) {
  return readIndexBlobInput(repository, relativePath).buffer
}

function isText(buffer) {
  if (buffer === null) return true
  if (buffer.includes(0)) return false
  const text = buffer.toString('utf8')
  return Buffer.from(text, 'utf8').equals(buffer)
}

function sourceLines(buffer) {
  if (buffer === null || buffer.length === 0) return []
  const normalized = buffer.toString('utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = normalized.split('\n')
  if (lines.at(-1) === '') lines.pop()
  return lines
}

function parseChangedRanges(patchBuffer) {
  const ranges = { before: [], after: [] }
  const patch = patchBuffer.toString('utf8')
  const pattern = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm
  for (const match of patch.matchAll(pattern)) {
    const beforeCount = match[2] === undefined ? 1 : Number(match[2])
    const afterCount = match[4] === undefined ? 1 : Number(match[4])
    if (beforeCount > 0) {
      const start = Number(match[1])
      ranges.before.push({ start, end: start + beforeCount - 1 })
    }
    if (afterCount > 0) {
      const start = Number(match[3])
      ranges.after.push({ start, end: start + afterCount - 1 })
    }
  }
  return ranges
}

function extractMetadataChanges(patchBuffer) {
  const metadataPattern = /^(?:old mode|new mode|new file mode|deleted file mode|similarity index|rename from|rename to|copy from|copy to) .+$/
  return patchBuffer
    .toString('utf8')
    .split('\n')
    .filter((line) => metadataPattern.test(line))
}

function allLinesRange(buffer) {
  const count = sourceLines(buffer).length
  return count === 0 ? [] : [{ start: 1, end: count }]
}

function snapshotMetadata(buffer, entryMetadata) {
  if (buffer === null) return null
  return {
    sha256: sha256(buffer),
    line_count: sourceLines(buffer).length,
    git_mode: entryMetadata?.git_mode ?? null,
    file_type: entryMetadata?.file_type ?? null,
    file: null,
  }
}

function workspaceChangeSet(repository, baseCommit) {
  const staged = parseNameStatus(
    runGit(repository, [
      'diff',
      '--cached',
      '--name-status',
      '-z',
      '--find-renames',
      baseCommit,
      '--',
    ]),
  ).map((change) => ({ ...change, sources: ['staged'] }))
  const unstaged = parseNameStatus(
    runGit(repository, ['diff', '--name-status', '-z', '--find-renames', '--']),
  ).map((change) => ({ ...change, sources: ['unstaged'] }))
  const untracked = splitNull(
    runGit(repository, ['ls-files', '--others', '--exclude-standard', '-z']),
  ).map((filePath) => ({
    change_type: 'A',
    old_path: null,
    path: filePath,
    sources: ['untracked'],
  }))
  const changes = [...staged, ...unstaged, ...untracked]
  const scopeDigest = sha256(
    stableJson(
      [...changes]
        .sort((left, right) => {
          if (left.path !== right.path) return left.path < right.path ? -1 : 1
          if (left.sources[0] !== right.sources[0]) {
            return left.sources[0] < right.sources[0] ? -1 : 1
          }
          const leftOld = left.old_path ?? ''
          const rightOld = right.old_path ?? ''
          return leftOld < rightOld ? -1 : leftOld > rightOld ? 1 : 0
        })
        .map(({ change_type, old_path, path: filePath, sources }) => ({
          change_type,
          old_path,
          path: filePath,
          sources,
      })),
    ),
  )
  return { changes, scopeDigest }
}

function collectWorkspace(repository) {
  const baseCommit = gitText(repository, ['rev-parse', '--verify', 'HEAD^{commit}'])
  const { changes, scopeDigest } = workspaceChangeSet(repository, baseCommit)

  const records = changes.map((change) => {
    const source = change.sources[0]
    const beforePath = change.old_path ?? change.path
    let patch = Buffer.alloc(0)
    let before
    let after
    let beforeInput
    let afterInput
    let beforeMetadata
    let afterMetadata
    if (source === 'staged') {
      beforeInput = change.change_type === 'A'
        ? unavailableInput()
        : readGitBlobInput(repository, baseCommit, beforePath)
      afterInput = change.change_type === 'D'
        ? unavailableInput()
        : readIndexBlobInput(repository, change.path)
      before = beforeInput.buffer
      after = afterInput.buffer
      beforeMetadata = change.change_type === 'A' ? null : readGitMetadata(repository, baseCommit, beforePath)
      afterMetadata = change.change_type === 'D' ? null : readIndexMetadata(repository, change.path)
      if (!beforeInput.excluded_reason && !afterInput.excluded_reason) {
        patch = runGit(repository, [
          'diff',
          '--cached',
          '--no-ext-diff',
          '--no-textconv',
          '--no-color',
          '--unified=0',
          '--find-renames',
          baseCommit,
          '--',
          ...new Set([beforePath, change.path]),
        ])
      }
    } else if (source === 'unstaged') {
      beforeInput = change.change_type === 'A'
        ? unavailableInput()
        : readIndexBlobInput(repository, beforePath)
      afterInput = change.change_type === 'D'
        ? unavailableInput()
        : readWorkingTreeInput(repository, change.path)
      before = beforeInput.buffer
      after = afterInput.buffer
      beforeMetadata = change.change_type === 'A' ? null : readIndexMetadata(repository, beforePath)
      afterMetadata = change.change_type === 'D' ? null : readWorkingTreeMetadata(repository, change.path)
      if (!beforeInput.excluded_reason && !afterInput.excluded_reason) {
        patch = runGit(repository, [
          'diff',
          '--no-ext-diff',
          '--no-textconv',
          '--no-color',
          '--unified=0',
          '--find-renames',
          '--',
          ...new Set([beforePath, change.path]),
        ])
      }
    } else {
      beforeInput = unavailableInput()
      afterInput = readWorkingTreeInput(repository, change.path)
      before = beforeInput.buffer
      after = afterInput.buffer
      beforeMetadata = null
      afterMetadata = readWorkingTreeMetadata(repository, change.path)
      patch = after ?? Buffer.alloc(0)
    }
    return {
      ...change,
      before,
      after,
      before_metadata: beforeMetadata,
      after_metadata: afterMetadata,
      excluded_reason: beforeInput.excluded_reason ?? afterInput.excluded_reason,
      observed_size_bytes: Math.max(
        beforeInput.observed_size_bytes ?? 0,
        afterInput.observed_size_bytes ?? 0,
      ),
      patch,
      ranges:
        source === 'untracked'
          ? { before: [], after: allLinesRange(after) }
          : parseChangedRanges(patch),
      metadata_changes: extractMetadataChanges(patch),
    }
  })

  return {
    repository,
    target: {
      mode: 'workspace',
      base_commit: baseCommit,
      head: 'WORKTREE',
      scope_digest: scopeDigest,
    },
    records,
  }
}

function collectRange(repository, baseRef, headRef) {
  const baseCommit = gitText(repository, ['rev-parse', '--verify', `${baseRef}^{commit}`])
  const headCommit = gitText(repository, ['rev-parse', '--verify', `${headRef}^{commit}`])
  const diffBase = gitText(repository, ['merge-base', baseCommit, headCommit])
  const changes = parseNameStatus(
    runGit(repository, [
      'diff',
      '--name-status',
      '-z',
      '--find-renames',
      diffBase,
      headCommit,
      '--',
    ]),
  )
  const records = changes.map((change) => {
    const beforePath = change.old_path ?? change.path
    const beforeInput = change.change_type === 'A'
      ? unavailableInput()
      : readGitBlobInput(repository, diffBase, beforePath)
    const afterInput = change.change_type === 'D'
      ? unavailableInput()
      : readGitBlobInput(repository, headCommit, change.path)
    const before = beforeInput.buffer
    const after = afterInput.buffer
    const beforeMetadata =
      change.change_type === 'A' ? null : readGitMetadata(repository, diffBase, beforePath)
    const afterMetadata =
      change.change_type === 'D' ? null : readGitMetadata(repository, headCommit, change.path)
    const patch = beforeInput.excluded_reason || afterInput.excluded_reason
      ? Buffer.alloc(0)
      : runGit(repository, [
          'diff',
          '--no-ext-diff',
          '--no-textconv',
          '--no-color',
          '--unified=0',
          '--find-renames',
          diffBase,
          headCommit,
          '--',
          ...new Set([beforePath, change.path]),
        ])
    return {
      ...change,
      sources: ['range'],
      before,
      after,
      before_metadata: beforeMetadata,
      after_metadata: afterMetadata,
      excluded_reason: beforeInput.excluded_reason ?? afterInput.excluded_reason,
      observed_size_bytes: Math.max(
        beforeInput.observed_size_bytes ?? 0,
        afterInput.observed_size_bytes ?? 0,
      ),
      patch,
      ranges: parseChangedRanges(patch),
      metadata_changes: extractMetadataChanges(patch),
    }
  })
  return {
    repository,
    target: {
      mode: 'range',
      comparison: 'three-dot',
      base_ref: baseRef,
      base_commit: baseCommit,
      diff_base: diffBase,
      head_ref: headRef,
      head_commit: headCommit,
    },
    records,
  }
}

function collectExplicitFiles(repository, files) {
  const uniquePaths = [...new Set(files.map((file) => normalizeRelativePath(repository, file)))]
  const records = uniquePaths.map((filePath) => {
    const afterInput = readWorkingTreeInput(repository, filePath)
    const after = afterInput.buffer
    return {
      change_type: 'M',
      old_path: null,
      path: filePath,
      sources: ['explicit'],
      before: null,
      after,
      before_metadata: null,
      after_metadata: readWorkingTreeMetadata(repository, filePath),
      excluded_reason: afterInput.excluded_reason,
      observed_size_bytes: afterInput.observed_size_bytes,
      patch: after ?? Buffer.alloc(0),
      ranges: { before: [], after: allLinesRange(after) },
      metadata_changes: [],
    }
  })
  return {
    repository,
    target: { mode: 'files', files: uniquePaths },
    records,
  }
}

function coverageFor(state, manifestItems = state.items) {
  const counts = { total: state.items.length, pending: 0, reviewed: 0, skipped: 0, failed: 0, excluded: 0 }
  const stateById = new Map(state.items.map((item) => [item.id, item]))
  counts.total = manifestItems.length
  for (const manifestItem of manifestItems) counts[stateById.get(manifestItem.id).status] += 1
  return {
    ...counts,
    complete:
      counts.reviewed > 0 &&
      counts.pending === 0 &&
      counts.skipped === 0 &&
      counts.failed === 0 &&
      counts.excluded === 0,
  }
}

function dispositionDigest(state, manifestItems) {
  const stateById = new Map(state.items.map((item) => [item.id, item]))
  return sha256(
    stableJson(
      manifestItems.map((item) => {
        const stateItem = stateById.get(item.id)
        return {
          id: item.id,
          status: stateItem.status,
          reason: stateItem.reason ?? null,
        }
      }),
    ),
  )
}

function queueItem(item) {
  const compactSnapshot = (snapshot) =>
    snapshot === null
      ? null
      : {
          line_count: snapshot.line_count,
          git_mode: snapshot.git_mode,
          file_type: snapshot.file_type,
        }
  const compact = {
    item_id: item.id,
    path: item.path,
    change_type: item.change_type,
    sources: item.sources,
    reviewable: item.reviewable,
  }
  if (item.old_path) compact.old_path = item.old_path
  if (item.excluded_reason) compact.excluded_reason = item.excluded_reason
  if (item.excluded_reason && item.observed_size_bytes !== null) {
    compact.observed_size_bytes = item.observed_size_bytes
  }
  if (item.before) compact.before = compactSnapshot(item.before)
  if (item.after) compact.after = compactSnapshot(item.after)
  if (item.changed_ranges.before.length > 0 || item.changed_ranges.after.length > 0) {
    compact.changed_ranges = item.changed_ranges
  }
  if (item.metadata_changes.length > 0) compact.metadata_changes = item.metadata_changes
  return compact
}

function queueTarget(target) {
  const { scope_digest: _scopeDigest, ...semanticTarget } = target
  if (semanticTarget.mode === 'files') return { mode: semanticTarget.mode }
  return semanticTarget
}

function createRun(collection, runRoot) {
  const orderedRecords = [...collection.records].sort((left, right) => {
    if (left.path !== right.path) return left.path < right.path ? -1 : 1
    const leftOld = left.old_path ?? ''
    const rightOld = right.old_path ?? ''
    if (leftOld !== rightOld) return leftOld < rightOld ? -1 : 1
    const leftSource = left.sources.join(',')
    const rightSource = right.sources.join(',')
    return leftSource < rightSource ? -1 : leftSource > rightSource ? 1 : 0
  })
  const preparedItems = orderedRecords.map((record) => {
    const beforeMetadata = snapshotMetadata(record.before, record.before_metadata)
    const afterMetadata = snapshotMetadata(record.after, record.after_metadata)
    const id = sha256(
      stableJson({
        path: record.path,
        old_path: record.old_path,
        change_type: record.change_type,
        sources: record.sources,
        before: beforeMetadata?.sha256 ?? null,
        after: afterMetadata?.sha256 ?? null,
        metadata_changes: record.metadata_changes,
      }),
    )
    const reviewBuffer = record.after ?? record.before
    const reviewable = !record.excluded_reason && reviewBuffer !== null && isText(reviewBuffer)
    return {
      serialized: {
        id,
        path: record.path,
        old_path: record.old_path,
        change_type: record.change_type,
        sources: record.sources,
        reviewable,
        excluded_reason:
          reviewable
            ? null
            : record.excluded_reason ?? (reviewBuffer === null ? 'unavailable_input' : 'binary_file'),
        observed_size_bytes: record.observed_size_bytes ?? reviewBuffer?.length ?? null,
        before: beforeMetadata,
        after: afterMetadata,
        changed_ranges: record.ranges,
        metadata_changes: record.metadata_changes,
        patch_sha256: sha256(record.patch),
      },
      before: record.before,
      after: record.after,
    }
  })

  const digestMaterial = {
    repository: collection.repository,
    target: collection.target,
    items: preparedItems.map(({ serialized }) => serialized),
  }
  const inputDigest = sha256(stableJson(digestMaterial))
  mkdirSync(runRoot, { recursive: true })
  const runDirectory = mkdtempSync(path.join(runRoot, `${inputDigest.slice(0, 12)}-`))
  const runId = path.basename(runDirectory)
  const snapshotsDirectory = path.join(runDirectory, 'snapshots')
  mkdirSync(snapshotsDirectory)

  for (const item of preparedItems) {
    for (const side of ['before', 'after']) {
      const buffer = item[side]
      if (buffer === null) continue
      const relativeSnapshot = `snapshots/${item.serialized.id}.${side}`
      writeFileSync(path.join(runDirectory, relativeSnapshot), buffer)
      item.serialized[side].file = relativeSnapshot
    }
  }

  const manifest = {
    schema_version: SCHEMA_VERSION,
    run_id: runId,
    created_at: new Date().toISOString(),
    repository: collection.repository,
    target: collection.target,
    input_digest: inputDigest,
    items: preparedItems.map(({ serialized }) => serialized),
  }
  const manifestPath = path.join(runDirectory, 'manifest.json')
  atomicWriteJson(manifestPath, manifest)
  const manifestDigest = sha256(readFileSync(manifestPath))
  const queuePath = path.join(runDirectory, 'review-queue.json')
  atomicWriteJson(queuePath, {
    schema_version: SCHEMA_VERSION,
    run_id: runId,
    target: queueTarget(manifest.target),
    items: manifest.items.map(queueItem),
  })
  const state = {
    schema_version: SCHEMA_VERSION,
    run_id: runId,
    status: 'PREPARED',
    manifest_digest: manifestDigest,
    updated_at: new Date().toISOString(),
    items: manifest.items.map((item) => ({
      id: item.id,
      path: item.path,
      sources: item.sources,
      status: item.reviewable ? 'pending' : 'excluded',
      reason: item.excluded_reason,
    })),
    validated_findings: null,
    conclusion: null,
  }
  state.coverage = coverageFor(state, manifest.items)
  const statePath = path.join(runDirectory, 'state.json')
  atomicWriteJson(statePath, state)
  return {
    status: state.status,
    run_dir: runDirectory,
    manifest_path: manifestPath,
    queue_path: queuePath,
    state_path: statePath,
    input_digest: inputDigest,
    target: manifest.target,
    coverage: state.coverage,
  }
}

export function prepareReview(options = {}) {
  const candidateRepository = realpathSync(options.repo ?? process.cwd())
  const files = options.files ?? []
  let collection
  if (files.length > 0) {
    if (options.base || options.head) {
      throw new ReviewRuntimeError('CONFLICTING_TARGETS', '--file 不能与 --base/--head 同时使用')
    }
    collection = collectExplicitFiles(candidateRepository, files)
  } else {
    const repository = gitRepositoryRoot(candidateRepository)
    collection = options.base
      ? collectRange(repository, options.base, options.head ?? 'HEAD')
      : collectWorkspace(repository)
  }
  const runRoot = path.resolve(options.runRoot ?? path.join(os.tmpdir(), 'code-review-runs'))
  return createRun(collection, runRoot)
}

function loadRun(runDirectory) {
  const resolvedRun = realpathSync(runDirectory)
  const manifestPath = path.join(resolvedRun, 'manifest.json')
  const statePath = path.join(resolvedRun, 'state.json')
  const manifestBytes = readFileSync(manifestPath)
  const manifest = JSON.parse(manifestBytes.toString('utf8'))
  const state = readJson(statePath, 'review state')
  if (
    manifest.schema_version !== SCHEMA_VERSION ||
    state.schema_version !== SCHEMA_VERSION ||
    manifest.run_id !== state.run_id ||
    state.manifest_digest !== sha256(manifestBytes)
  ) {
    throw new ReviewRuntimeError('RUN_INTEGRITY_FAILED', 'Review run 的 Manifest 或 State 完整性校验失败')
  }
  assertStateProjection(manifest, state)
  return { runDirectory: resolvedRun, manifest, state, statePath }
}

function assertStateProjection(manifest, state) {
  if (!Array.isArray(state.items) || state.items.length !== manifest.items.length) {
    throw new ReviewRuntimeError('RUN_INTEGRITY_FAILED', 'Review State 与 Manifest item 数量不一致')
  }
  const stateById = new Map()
  for (const stateItem of state.items) {
    if (stateById.has(stateItem.id)) {
      throw new ReviewRuntimeError('RUN_INTEGRITY_FAILED', `Review State 包含重复 item：${stateItem.id}`)
    }
    stateById.set(stateItem.id, stateItem)
  }
  for (const manifestItem of manifest.items) {
    const stateItem = stateById.get(manifestItem.id)
    const allowedStatuses = manifestItem.reviewable
      ? new Set(['pending', 'reviewed', 'skipped', 'failed'])
      : new Set(['excluded'])
    if (
      !stateItem ||
      stateItem.path !== manifestItem.path ||
      stableJson(stateItem.sources) !== stableJson(manifestItem.sources) ||
      !allowedStatuses.has(stateItem.status)
    ) {
      throw new ReviewRuntimeError('RUN_INTEGRITY_FAILED', `Review State item 不是 Manifest 的有效投影：${manifestItem.id}`)
    }
  }
  const expectedCoverage = coverageFor(state, manifest.items)
  if (stableJson(state.coverage) !== stableJson(expectedCoverage)) {
    throw new ReviewRuntimeError('RUN_INTEGRITY_FAILED', 'Review State coverage 与 Manifest 派生结果不一致')
  }
}

function assertSnapshotIntegrity(run) {
  for (const item of run.manifest.items) {
    for (const side of ['before', 'after']) {
      const snapshot = item[side]
      if (snapshot === null) continue
      const snapshotPath = path.join(run.runDirectory, snapshot.file)
      let snapshotBytes
      try {
        snapshotBytes = readFileSync(snapshotPath)
      } catch (error) {
        throw new ReviewRuntimeError(
          'SNAPSHOT_INTEGRITY_FAILED',
          `Review snapshot 不可读取：${item.path} (${side})`,
          { cause: error.message },
        )
      }
      if (sha256(snapshotBytes) !== snapshot.sha256) {
        throw new ReviewRuntimeError(
          'SNAPSHOT_INTEGRITY_FAILED',
          `Review snapshot 摘要不匹配：${item.path} (${side})`,
        )
      }
    }
  }
}

function snapshotDrift(item, side, current, currentMetadata) {
  const snapshot = item[side]
  if (snapshot === null) {
    return current === null ? null : `${item.path} (${item.sources[0]} ${side}) 在准备后被创建`
  }
  if (current === null) return `${item.path} (${item.sources[0]} ${side}) 在准备后不可用`
  if (sha256(current) !== snapshot.sha256) {
    return `${item.path} (${item.sources[0]} ${side}) 内容在准备后发生变化`
  }
  if (
    snapshot.git_mode !== (currentMetadata?.git_mode ?? null) ||
    snapshot.file_type !== (currentMetadata?.file_type ?? null)
  ) {
    return `${item.path} (${item.sources[0]} ${side}) mode 或文件类型在准备后发生变化`
  }
  return null
}

function inputDrift(manifest) {
  if (manifest.target.mode === 'workspace') {
    const currentHead = gitText(manifest.repository, ['rev-parse', '--verify', 'HEAD^{commit}'])
    if (currentHead !== manifest.target.base_commit) {
      return `HEAD 已从 ${manifest.target.base_commit} 变为 ${currentHead}`
    }
    const { scopeDigest } = workspaceChangeSet(manifest.repository, currentHead)
    if (scopeDigest !== manifest.target.scope_digest) {
      return 'staged、unstaged 或 untracked 文件集合在准备后发生变化'
    }
  }
  if (manifest.target.mode === 'range') return null
  for (const item of manifest.items) {
    const source = item.sources[0]
    if (manifest.target.mode === 'workspace' && source === 'staged') {
      const drift = snapshotDrift(
        item,
        'after',
        readIndexBlob(manifest.repository, item.path),
        readIndexMetadata(manifest.repository, item.path),
      )
      if (drift) return drift
      continue
    }
    if (manifest.target.mode === 'workspace' && source === 'unstaged') {
      const beforePath = item.old_path ?? item.path
      const beforeDrift = snapshotDrift(
        item,
        'before',
        readIndexBlob(manifest.repository, beforePath),
        readIndexMetadata(manifest.repository, beforePath),
      )
      if (beforeDrift) return beforeDrift
    }
    const afterDrift = snapshotDrift(
      item,
      'after',
      readWorkingTreeFile(manifest.repository, item.path),
      readWorkingTreeMetadata(manifest.repository, item.path),
    )
    if (afterDrift) return afterDrift
  }
  return null
}

function saveState(run, state) {
  state.updated_at = new Date().toISOString()
  state.coverage = coverageFor(state, run.manifest.items)
  atomicWriteJson(run.statePath, state)
  return state
}

function assertMutableRun(run) {
  if (['COMPLETE', 'PARTIAL', 'INVALIDATED'].includes(run.state.status)) {
    throw new ReviewRuntimeError('TERMINAL_RUN', `Review run 已进入终态：${run.state.status}`)
  }
  const drift = inputDrift(run.manifest)
  if (drift) {
    run.state.status = 'INVALIDATED'
    run.state.invalidation_reason = drift
    saveState(run, run.state)
    throw new ReviewRuntimeError('INPUT_INVALIDATED', `Review 输入已失效：${drift}`)
  }
}

function findStateItem(run, options) {
  if (!options.item && !options.path) {
    throw new ReviewRuntimeError('MISSING_ITEM', 'mark 需要 --item 或 --path')
  }
  const matches = options.item
    ? run.state.items.filter((item) => item.id === options.item)
    : run.state.items.filter(
        (item) => item.path === options.path && (!options.source || item.sources.includes(options.source)),
      )
  if (matches.length !== 1) {
    throw new ReviewRuntimeError('ITEM_NOT_FOUND', '无法唯一定位 Review item', {
      item: options.item,
      path: options.path,
      source: options.source,
    })
  }
  return matches[0]
}

export function markReviewItem(options) {
  return withRunLock(options.run, (runDirectory) => {
    const run = loadRun(runDirectory)
    assertMutableRun(run)
    const item = findStateItem(run, options)
    const allowed = new Set(['reviewed', 'skipped', 'failed'])
    if (!allowed.has(options.status)) {
      throw new ReviewRuntimeError('INVALID_ITEM_STATUS', '--status 必须是 reviewed、skipped 或 failed')
    }
    if (item.status === 'excluded') {
      throw new ReviewRuntimeError('EXCLUDED_ITEM', `不能修改已确定排除的 item：${item.path}`)
    }
    if (options.status !== 'reviewed' && !options.reason?.trim()) {
      throw new ReviewRuntimeError('MISSING_REASON', `${options.status} 状态需要非空 --reason`)
    }
    item.status = options.status
    item.reason = options.reason?.trim() || null
    run.state.validated_findings = null
    run.state.conclusion = null
    delete run.state.result_path
    run.state.status = 'REVIEWING'
    saveState(run, run.state)
    return { status: run.state.status, item, coverage: run.state.coverage }
  })
}

function resolveLocalSchema(reference) {
  const prefix = '#/$defs/'
  if (!reference.startsWith(prefix)) {
    throw new ReviewRuntimeError('UNSUPPORTED_SCHEMA_REFERENCE', `不支持的 Schema 引用：${reference}`)
  }
  const definition = FINDINGS_SCHEMA.$defs[reference.slice(prefix.length)]
  if (!definition) {
    throw new ReviewRuntimeError('MISSING_SCHEMA_DEFINITION', `Schema 定义不存在：${reference}`)
  }
  return definition
}

function validateAgainstSchema(value, schema, location = '$') {
  if (schema.$ref) return validateAgainstSchema(value, resolveLocalSchema(schema.$ref), location)
  if (schema.oneOf) {
    const branchErrors = schema.oneOf.map((branch) => validateAgainstSchema(value, branch, location))
    const validBranches = branchErrors.filter((errors) => errors.length === 0)
    return validBranches.length === 1
      ? []
      : [`${location} 必须且只能匹配一个 Schema 分支`]
  }
  const errors = []
  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${location} 必须等于 ${JSON.stringify(schema.const)}`)
  }
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${location} 必须是 ${schema.enum.join('、')} 之一`)
  }
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return [...errors, `${location} 必须是 object`]
    }
    for (const field of schema.required ?? []) {
      if (!(field in value)) errors.push(`${location} 缺少 ${field}`)
    }
    const properties = schema.properties ?? {}
    if (schema.additionalProperties === false) {
      for (const field of Object.keys(value)) {
        if (!(field in properties)) errors.push(`${location} 包含未知字段：${field}`)
      }
    }
    for (const [field, propertyValue] of Object.entries(value)) {
      if (properties[field]) {
        errors.push(...validateAgainstSchema(propertyValue, properties[field], `${location}.${field}`))
      }
    }
  } else if (schema.type === 'array') {
    if (!Array.isArray(value)) return [...errors, `${location} 必须是 array`]
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${location} 至少需要 ${schema.minItems} 项`)
    }
    if (schema.uniqueItems && new Set(value.map(stableJson)).size !== value.length) {
      errors.push(`${location} 不能包含重复项`)
    }
    if (schema.items) {
      value.forEach((item, index) => {
        errors.push(...validateAgainstSchema(item, schema.items, `${location}[${index}]`))
      })
    }
  } else if (schema.type === 'string') {
    if (typeof value !== 'string') return [...errors, `${location} 必须是 string`]
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${location} 至少需要 ${schema.minLength} 个字符`)
    }
  } else if (schema.type === 'integer') {
    if (!Number.isInteger(value)) return [...errors, `${location} 必须是 integer`]
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push(`${location} 不能小于 ${schema.minimum}`)
    }
  }
  return errors
}

function validateFindingShape(document) {
  const errors = validateAgainstSchema(document, FINDINGS_SCHEMA)
  if (Array.isArray(document?.findings)) {
    document.findings.forEach((finding, index) => {
      if (
        finding?.anchor_kind === 'line' &&
        Number.isInteger(finding.start_line) &&
        Number.isInteger(finding.end_line) &&
        finding.end_line < finding.start_line
      ) {
        errors.push(`$.findings[${index}].end_line 必须不小于 start_line`)
      }
    })
  }
  return errors
}

function intervalsOverlap(start, end, range) {
  return start <= range.end && end >= range.start
}

function normalizeFinding(run, finding, index) {
  const findingPath = normalizeRelativePath(run.manifest.repository, finding.path, false)
  const item = run.manifest.items.find((candidate) => candidate.id === finding.item_id)
  if (!item) {
    throw new ReviewRuntimeError('FINDING_OUTSIDE_MANIFEST', `Finding ${index + 1} 的 item_id 不属于 Review Manifest`)
  }
  if (finding.anchor_kind === 'file') {
    if (findingPath !== item.path) {
      throw new ReviewRuntimeError('FINDING_PATH_MISMATCH', `Finding ${index + 1} 的路径与 item_id 不匹配`)
    }
    const invalidMetadata = finding.metadata_changes.filter(
      (change) => !item.metadata_changes.includes(change),
    )
    if (invalidMetadata.length > 0) {
      throw new ReviewRuntimeError('FINDING_METADATA_MISMATCH', `Finding ${index + 1} 包含未冻结的 metadata 变化`, {
        invalid_metadata_changes: invalidMetadata,
        available_metadata_changes: item.metadata_changes,
      })
    }
    const normalized = { ...finding, path: findingPath }
    return { id: sha256(stableJson(normalized)), ...normalized }
  }
  const sidePath = finding.side === 'before' ? item.old_path ?? item.path : item.path
  if (findingPath !== sidePath) {
    throw new ReviewRuntimeError('FINDING_PATH_MISMATCH', `Finding ${index + 1} 的路径、side 与 item_id 不匹配`)
  }
  if (!item.reviewable) {
    throw new ReviewRuntimeError('FINDING_ON_EXCLUDED_ITEM', `Finding ${index + 1} 指向不可审查 item：${findingPath}`)
  }
  const snapshot = item[finding.side]
  if (snapshot === null) {
    throw new ReviewRuntimeError('MISSING_FINDING_SIDE', `Finding ${index + 1} 的 ${finding.side} 侧不存在`)
  }
  const snapshotPath = path.join(run.runDirectory, snapshot.file)
  const snapshotBuffer = readFileSync(snapshotPath)
  if (sha256(snapshotBuffer) !== snapshot.sha256) {
    throw new ReviewRuntimeError('SNAPSHOT_INTEGRITY_FAILED', `Finding ${index + 1} 的快照摘要不匹配`)
  }
  const lines = sourceLines(snapshotBuffer)
  if (finding.end_line > lines.length) {
    throw new ReviewRuntimeError('FINDING_LINE_OUT_OF_RANGE', `Finding ${index + 1} 行号超出文件范围`, {
      line_count: lines.length,
    })
  }
  const actualCode = lines.slice(finding.start_line - 1, finding.end_line).join('\n')
  const normalizedExistingCode = finding.existing_code.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if (actualCode !== normalizedExistingCode) {
    throw new ReviewRuntimeError('FINDING_ANCHOR_MISMATCH', `Finding ${index + 1} 的 existing_code 与快照不匹配`, {
      expected: actualCode,
      actual: normalizedExistingCode,
    })
  }
  if (run.manifest.target.mode !== 'files') {
    const changedRanges = item.changed_ranges[finding.side]
    if (!changedRanges.some((range) => intervalsOverlap(finding.start_line, finding.end_line, range))) {
      throw new ReviewRuntimeError('FINDING_NOT_ON_CHANGED_LINE', `Finding ${index + 1} 未覆盖变更行`)
    }
  }
  const normalized = { ...finding, path: findingPath }
  return {
    id: sha256(stableJson(normalized)),
    ...normalized,
  }
}

export function validateFindings(options) {
  return withRunLock(options.run, (runDirectory) => {
    const run = loadRun(runDirectory)
    assertMutableRun(run)
    assertSnapshotIntegrity(run)
    const document = readJson(path.resolve(options.input), 'candidate findings')
    const shapeErrors = validateFindingShape(document)
    if (shapeErrors.length > 0) {
      throw new ReviewRuntimeError('FINDING_SCHEMA_FAILED', 'Candidate findings 不符合 Schema', {
        errors: shapeErrors,
      })
    }
    const findings = document.findings.map((finding, index) => normalizeFinding(run, finding, index))
    const ids = new Set()
    for (const finding of findings) {
      if (ids.has(finding.id)) {
        throw new ReviewRuntimeError('DUPLICATE_FINDING', `存在重复 Finding：${finding.id}`)
      }
      ids.add(finding.id)
    }
    const output = {
      schema_version: SCHEMA_VERSION,
      input_digest: run.manifest.input_digest,
      disposition_digest: dispositionDigest(run.state, run.manifest.items),
      findings,
    }
    const outputPath = path.join(run.runDirectory, 'validated-findings.json')
    atomicWriteJson(outputPath, output)
    run.state.validated_findings = {
      path: outputPath,
      sha256: sha256(readFileSync(outputPath)),
      count: findings.length,
      disposition_digest: output.disposition_digest,
    }
    run.state.status = 'VALIDATED'
    saveState(run, run.state)
    return {
      status: run.state.status,
      findings_path: outputPath,
      finding_count: findings.length,
      coverage: run.state.coverage,
    }
  })
}

function loadValidatedFindings(run) {
  const record = run.state.validated_findings
  if (!record) {
    throw new ReviewRuntimeError('FINDINGS_NOT_VALIDATED', '请先使用 validate 校验 Candidate findings')
  }
  const bytes = readFileSync(record.path)
  if (sha256(bytes) !== record.sha256) {
    throw new ReviewRuntimeError('VALIDATED_FINDINGS_INTEGRITY_FAILED', 'Validated findings 摘要不匹配')
  }
  const document = JSON.parse(bytes.toString('utf8'))
  if (document.input_digest !== run.manifest.input_digest) {
    throw new ReviewRuntimeError('FINDINGS_INPUT_MISMATCH', 'Validated findings 不属于当前输入')
  }
  const currentDispositionDigest = dispositionDigest(run.state, run.manifest.items)
  if (
    document.disposition_digest !== currentDispositionDigest ||
    record.disposition_digest !== currentDispositionDigest
  ) {
    throw new ReviewRuntimeError('FINDINGS_DISPOSITION_MISMATCH', 'Validated findings 不属于当前 disposition 状态')
  }
  return document.findings
}

export function finalizeReview(options) {
  return withRunLock(options.run, (runDirectory) => {
    const run = loadRun(runDirectory)
    assertMutableRun(run)
    assertSnapshotIntegrity(run)
    const conclusion = options.conclusion
    if (!['APPROVE', 'REQUEST_CHANGES', 'COMMENT'].includes(conclusion)) {
      throw new ReviewRuntimeError('INVALID_CONCLUSION', '--conclusion 必须是 APPROVE、REQUEST_CHANGES 或 COMMENT')
    }
    const findings = loadValidatedFindings(run)
    const blockingFindings = findings.filter((finding) => BLOCKING_SEVERITIES.has(finding.severity))
    const coverage = coverageFor(run.state, run.manifest.items)
    const allowedConclusions = ['COMMENT']
    if (blockingFindings.length > 0) allowedConclusions.unshift('REQUEST_CHANGES')
    if (blockingFindings.length === 0 && coverage.complete) allowedConclusions.unshift('APPROVE')
    if (!allowedConclusions.includes(conclusion)) {
      throw new ReviewRuntimeError('CONCLUSION_BLOCKED', `结论 ${conclusion} 未通过确定性门禁`, {
        allowed_conclusions: allowedConclusions,
        coverage,
        blocking_finding_count: blockingFindings.length,
      })
    }
    const result = {
      schema_version: SCHEMA_VERSION,
      run_id: run.manifest.run_id,
      input_digest: run.manifest.input_digest,
      status: coverage.complete ? 'COMPLETE' : 'PARTIAL',
      conclusion,
      allowed_conclusions: allowedConclusions,
      coverage,
      finding_count: findings.length,
      blocking_finding_count: blockingFindings.length,
    }
    const resultPath = path.join(run.runDirectory, 'result.json')
    atomicWriteJson(resultPath, result)
    run.state.status = result.status
    run.state.conclusion = conclusion
    run.state.result_path = resultPath
    saveState(run, run.state)
    return { ...result, result_path: resultPath }
  })
}

export function reviewStatus(options) {
  return withRunLock(options.run, (runDirectory) => {
    const run = loadRun(runDirectory)
    const drift = inputDrift(run.manifest)
    if (drift && !['COMPLETE', 'PARTIAL', 'INVALIDATED'].includes(run.state.status)) {
      run.state.status = 'INVALIDATED'
      run.state.invalidation_reason = drift
      saveState(run, run.state)
    }
    return {
      status: run.state.status,
      run_id: run.manifest.run_id,
      target: run.manifest.target,
      coverage: coverageFor(run.state, run.manifest.items),
      validated_findings: run.state.validated_findings,
      conclusion: run.state.conclusion,
      invalidation_reason: run.state.invalidation_reason ?? null,
      fresh: drift === null && run.state.status !== 'INVALIDATED',
      current_input_drift: drift,
    }
  })
}

function parseOptions(tokens) {
  const options = { files: [] }
  for (let index = 0; index < tokens.length; index += 1) {
    const flag = tokens[index]
    if (!flag.startsWith('--')) {
      throw new ReviewRuntimeError('INVALID_ARGUMENT', `无法识别参数：${flag}`)
    }
    const value = tokens[++index]
    if (value === undefined || value.startsWith('--')) {
      throw new ReviewRuntimeError('MISSING_ARGUMENT_VALUE', `${flag} 缺少值`)
    }
    const key = flag.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
    if (key === 'file') options.files.push(value)
    else options[key] = value
  }
  return options
}

function help() {
  return `Usage:
  review.mjs prepare [--repo PATH] [--run-root PATH]
  review.mjs prepare [--repo PATH] --base REF [--head REF]
  review.mjs prepare [--repo PATH] --file PATH [--file PATH ...]
  review.mjs mark --run PATH (--item ID | --path PATH [--source SOURCE]) --status reviewed|skipped|failed [--reason TEXT]
  review.mjs validate --run PATH --input PATH
  review.mjs finalize --run PATH --conclusion APPROVE|REQUEST_CHANGES|COMMENT
  review.mjs status --run PATH`
}

function requireOption(options, key, command) {
  if (!options[key]) {
    throw new ReviewRuntimeError('MISSING_ARGUMENT', `${command} 需要 --${key}`)
  }
}

async function main(argv) {
  const [command, ...tokens] = argv
  if (!command || command === '--help' || command === 'help') {
    process.stdout.write(`${help()}\n`)
    return
  }
  const options = parseOptions(tokens)
  let result
  if (command === 'prepare') {
    result = prepareReview(options)
  } else if (command === 'mark') {
    requireOption(options, 'run', command)
    requireOption(options, 'status', command)
    result = markReviewItem(options)
  } else if (command === 'validate') {
    requireOption(options, 'run', command)
    requireOption(options, 'input', command)
    result = validateFindings(options)
  } else if (command === 'finalize') {
    requireOption(options, 'run', command)
    requireOption(options, 'conclusion', command)
    result = finalizeReview(options)
  } else if (command === 'status') {
    requireOption(options, 'run', command)
    result = reviewStatus(options)
  } else {
    throw new ReviewRuntimeError('UNKNOWN_COMMAND', `未知命令：${command}`)
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

const isEntrypoint = process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
if (isEntrypoint) {
  main(process.argv.slice(2)).catch((error) => {
    const output = {
      status: 'ERROR',
      code: error.code ?? 'UNEXPECTED_ERROR',
      message: error.message,
      details: error.details,
    }
    process.stderr.write(`${JSON.stringify(output, null, 2)}\n`)
    process.exitCode = 1
  })
}
