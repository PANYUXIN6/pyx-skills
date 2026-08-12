import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile, execFileSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

import {
  finalizeReview,
  markReviewItem,
  prepareReview,
  reviewStatus,
  validateFindings,
} from './review.mjs'

const SCRIPT_PATH = fileURLToPath(new URL('./review.mjs', import.meta.url))
const execFileAsync = promisify(execFile)

function git(repository, args) {
  return execFileSync('git', ['-C', repository, ...args], { encoding: 'utf8' }).trim()
}

function createRepository(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'code-review-runtime-test-'))
  const repository = path.join(root, 'repository')
  const runRoot = path.join(root, 'runs')
  mkdirSync(repository)
  git(repository, ['init', '-q'])
  git(repository, ['config', 'user.email', 'review@example.com'])
  git(repository, ['config', 'user.name', 'Review Test'])
  git(repository, ['config', 'core.filemode', 'true'])
  writeFileSync(path.join(repository, 'app.js'), 'const mode = "safe"\nrun(mode)\n')
  writeFileSync(path.join(repository, 'worker.js'), 'export const worker = true\n')
  git(repository, ['add', '.'])
  git(repository, ['commit', '-qm', 'initial'])
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return { root, repository, runRoot }
}

function writeFindings(root, findings) {
  const candidatePath = path.join(root, `findings-${Math.random().toString(16).slice(2)}.json`)
  writeFileSync(
    candidatePath,
    `${JSON.stringify({ schema_version: 2, findings }, null, 2)}\n`,
  )
  return candidatePath
}

function lineFinding(itemId, overrides = {}) {
  return {
    item_id: itemId,
    severity: 'P1',
    title: 'Unsafe mode reaches the runner',
    path: 'app.js',
    anchor_kind: 'line',
    side: 'after',
    start_line: 1,
    end_line: 1,
    existing_code: 'const mode = "unsafe"',
    trigger: 'The changed default is used by run(mode).',
    impact: 'The unsafe execution path becomes the default.',
    evidence: 'Line 2 passes the changed value directly to run.',
    fix_direction: 'Keep the safe default or validate the mode before use.',
    ...overrides,
  }
}

function metadataFinding(item, overrides = {}) {
  return {
    item_id: item.id,
    severity: 'P1',
    title: 'Deployment script is no longer executable',
    path: item.path,
    anchor_kind: 'file',
    metadata_changes: item.metadata_changes,
    trigger: 'The deployment entry point is invoked directly by the release job.',
    impact: 'The release job fails before the script starts.',
    evidence: 'The frozen Git metadata removes the executable bit.',
    fix_direction: 'Restore the executable file mode.',
    ...overrides,
  }
}

function loadManifest(prepared) {
  return JSON.parse(readFileSync(prepared.manifest_path, 'utf8'))
}

test('workspace freezes staged, unstaged, and untracked layers as separate items', (t) => {
  const { root, repository, runRoot } = createRepository(t)
  writeFileSync(path.join(repository, 'app.js'), 'const mode = "unsafe"\nrun(mode)\n')
  git(repository, ['add', 'app.js'])
  writeFileSync(path.join(repository, 'app.js'), 'const mode = "unsafe"\nrun(mode)\nlog(mode)\n')
  writeFileSync(path.join(repository, 'new.js'), 'export const added = true\n')

  const prepared = prepareReview({ repo: repository, runRoot })
  const manifest = loadManifest(prepared)
  const appItems = manifest.items.filter((item) => item.path === 'app.js')
  const stagedItem = appItems.find((item) => item.sources[0] === 'staged')
  const unstagedItem = appItems.find((item) => item.sources[0] === 'unstaged')
  const untrackedItem = manifest.items.find((item) => item.path === 'new.js')

  assert.equal(appItems.length, 2)
  assert.deepEqual(stagedItem.sources, ['staged'])
  assert.deepEqual(unstagedItem.sources, ['unstaged'])
  assert.deepEqual(untrackedItem.sources, ['untracked'])
  assert.equal(prepared.coverage.pending, 3)

  for (const item of manifest.items) {
    markReviewItem({ run: prepared.run_dir, item: item.id, status: 'reviewed' })
  }
  const candidate = writeFindings(root, [lineFinding(stagedItem.id)])
  const validated = validateFindings({ run: prepared.run_dir, input: candidate })
  const result = finalizeReview({ run: prepared.run_dir, conclusion: 'REQUEST_CHANGES' })

  assert.equal(validated.finding_count, 1)
  assert.equal(result.status, 'COMPLETE')
})

test('workspace keeps staged content even when an unstaged edit restores HEAD', (t) => {
  const { root, repository, runRoot } = createRepository(t)
  writeFileSync(path.join(repository, 'cancelled.js'), 'const value = "safe"\n')
  git(repository, ['add', 'cancelled.js'])
  git(repository, ['commit', '-qm', 'add cancelled fixture'])
  writeFileSync(path.join(repository, 'cancelled.js'), 'const value = "unsafe"\n')
  git(repository, ['add', 'cancelled.js'])
  writeFileSync(path.join(repository, 'cancelled.js'), 'const value = "safe"\n')

  const prepared = prepareReview({ repo: repository, runRoot })
  const manifest = loadManifest(prepared)
  const items = manifest.items.filter((item) => item.path === 'cancelled.js')
  const stagedItem = items.find((item) => item.sources[0] === 'staged')
  const unstagedItem = items.find((item) => item.sources[0] === 'unstaged')

  assert.equal(items.length, 2)
  assert.equal(
    readFileSync(path.join(prepared.run_dir, stagedItem.after.file), 'utf8'),
    'const value = "unsafe"\n',
  )
  assert.equal(
    readFileSync(path.join(prepared.run_dir, unstagedItem.after.file), 'utf8'),
    'const value = "safe"\n',
  )

  for (const item of items) {
    markReviewItem({ run: prepared.run_dir, item: item.id, status: 'reviewed' })
  }
  const candidate = writeFindings(root, [
    lineFinding(stagedItem.id, {
      path: 'cancelled.js',
      existing_code: 'const value = "unsafe"',
    }),
  ])
  validateFindings({ run: prepared.run_dir, input: candidate })
  const result = finalizeReview({ run: prepared.run_dir, conclusion: 'REQUEST_CHANGES' })
  assert.equal(result.status, 'COMPLETE')
})

test('pure renames do not turn unchanged source lines into changed ranges', (t) => {
  const { root, repository, runRoot } = createRepository(t)
  const oldPath = path.join(repository, 'old-name.js')
  writeFileSync(oldPath, 'const unchanged = 1\nexport const value = unchanged\n')
  git(repository, ['add', 'old-name.js'])
  git(repository, ['commit', '-qm', 'add rename fixture'])
  git(repository, ['mv', 'old-name.js', 'new-name.js'])

  const prepared = prepareReview({ repo: repository, runRoot })
  const item = loadManifest(prepared).items.find((candidate) => candidate.path === 'new-name.js')

  assert.equal(item.change_type, 'R')
  assert.deepEqual(item.changed_ranges, { before: [], after: [] })
  assert.deepEqual(item.metadata_changes, ['similarity index 100%', 'rename from old-name.js', 'rename to new-name.js'])

  markReviewItem({ run: prepared.run_dir, item: item.id, status: 'reviewed' })
  assert.throws(
    () =>
      validateFindings({
        run: prepared.run_dir,
        input: writeFindings(root, [
          lineFinding(item.id, {
            path: 'new-name.js',
            existing_code: 'const unchanged = 1',
          }),
        ]),
      }),
    (error) => error.code === 'FINDING_NOT_ON_CHANGED_LINE',
  )
})

test('renames with edits expose only the edited source range', (t) => {
  const { root, repository, runRoot } = createRepository(t)
  const original = Array.from({ length: 10 }, (_, index) => `export const value${index + 1} = ${index + 1}`).join('\n')
  writeFileSync(path.join(repository, 'before.js'), `${original}\n`)
  git(repository, ['add', 'before.js'])
  git(repository, ['commit', '-qm', 'add edited rename fixture'])
  git(repository, ['mv', 'before.js', 'after.js'])
  const edited = original.replace('export const value6 = 6', 'export const value6 = 60')
  writeFileSync(path.join(repository, 'after.js'), `${edited}\n`)
  git(repository, ['add', 'after.js'])

  const prepared = prepareReview({ repo: repository, runRoot })
  const item = loadManifest(prepared).items.find((candidate) => candidate.path === 'after.js')

  assert.equal(item.change_type, 'R')
  assert.deepEqual(item.changed_ranges.after, [{ start: 6, end: 6 }])

  markReviewItem({ run: prepared.run_dir, item: item.id, status: 'reviewed' })
  assert.throws(
    () =>
      validateFindings({
        run: prepared.run_dir,
        input: writeFindings(root, [
          lineFinding(item.id, {
            path: 'after.js',
            existing_code: 'export const value1 = 1',
          }),
        ]),
      }),
    (error) => error.code === 'FINDING_NOT_ON_CHANGED_LINE',
  )
  const validated = validateFindings({
    run: prepared.run_dir,
    input: writeFindings(root, [
      lineFinding(item.id, {
        path: 'after.js',
        start_line: 6,
        end_line: 6,
        existing_code: 'export const value6 = 60',
      }),
    ]),
  })
  assert.equal(validated.finding_count, 1)
})

test('prepare disables repository-configured Git textconv and fsmonitor commands', (t) => {
  const { root, repository, runRoot } = createRepository(t)
  const textconvMarkerPath = path.join(root, 'textconv-ran')
  const fsmonitorMarkerPath = path.join(root, 'fsmonitor-ran')
  const driverPath = path.join(repository, 'textconv.sh')
  const fsmonitorPath = path.join(repository, 'fsmonitor.sh')
  writeFileSync(path.join(repository, '.gitattributes'), '*.txt diff=marker\n')
  writeFileSync(path.join(repository, 'payload.txt'), 'safe\n')
  writeFileSync(
    driverPath,
    `#!/bin/sh\ntouch ${JSON.stringify(textconvMarkerPath)}\ncat "$1"\n`,
  )
  writeFileSync(fsmonitorPath, `#!/bin/sh\ntouch ${JSON.stringify(fsmonitorMarkerPath)}\n`)
  chmodSync(driverPath, 0o755)
  chmodSync(fsmonitorPath, 0o755)
  git(repository, ['config', 'diff.marker.textconv', driverPath])
  git(repository, ['add', '.'])
  git(repository, ['commit', '-qm', 'add textconv fixture'])
  writeFileSync(path.join(repository, 'payload.txt'), 'changed\n')
  git(repository, ['add', 'payload.txt'])
  git(repository, ['config', 'core.fsmonitor', fsmonitorPath])

  prepareReview({ repo: repository, runRoot })

  assert.equal(existsSync(textconvMarkerPath), false)
  assert.equal(existsSync(fsmonitorMarkerPath), false)
})

test('path-only marking rejects ambiguous staged and unstaged items', (t) => {
  const { repository, runRoot } = createRepository(t)
  writeFileSync(path.join(repository, 'app.js'), 'const mode = "unsafe"\nrun(mode)\n')
  git(repository, ['add', 'app.js'])
  writeFileSync(path.join(repository, 'app.js'), 'const mode = "unsafe"\nrun(mode)\nlog(mode)\n')
  const prepared = prepareReview({ repo: repository, runRoot })

  assert.throws(
    () => markReviewItem({ run: prepared.run_dir, path: 'app.js', status: 'reviewed' }),
    (error) => error.code === 'ITEM_NOT_FOUND',
  )
  const marked = markReviewItem({
    run: prepared.run_dir,
    path: 'app.js',
    source: 'staged',
    status: 'reviewed',
  })
  assert.deepEqual(marked.item.sources, ['staged'])
})

test('approval is blocked while declared dispositions are incomplete', (t) => {
  const { root, repository, runRoot } = createRepository(t)
  writeFileSync(path.join(repository, 'app.js'), 'const mode = "unsafe"\nrun(mode)\n')
  const prepared = prepareReview({ repo: repository, runRoot })
  validateFindings({ run: prepared.run_dir, input: writeFindings(root, []) })

  assert.throws(
    () => finalizeReview({ run: prepared.run_dir, conclusion: 'APPROVE' }),
    (error) => error.code === 'CONCLUSION_BLOCKED' && error.details.coverage.pending === 1,
  )
})

test('a disposition change invalidates findings validated against earlier coverage', (t) => {
  const { root, repository, runRoot } = createRepository(t)
  const prepared = prepareReview({
    repo: repository,
    runRoot,
    files: ['app.js', 'worker.js'],
  })
  const [first, second] = loadManifest(prepared).items
  markReviewItem({ run: prepared.run_dir, item: first.id, status: 'reviewed' })
  validateFindings({ run: prepared.run_dir, input: writeFindings(root, []) })
  markReviewItem({ run: prepared.run_dir, item: second.id, status: 'reviewed' })

  const status = reviewStatus({ run: prepared.run_dir })
  assert.equal(status.validated_findings, null)
  assert.throws(
    () => finalizeReview({ run: prepared.run_dir, conclusion: 'APPROVE' }),
    (error) => error.code === 'FINDINGS_NOT_VALIDATED',
  )
})

test('finding validation rejects fabricated source anchors', (t) => {
  const { root, repository, runRoot } = createRepository(t)
  writeFileSync(path.join(repository, 'app.js'), 'const mode = "unsafe"\nrun(mode)\n')
  const prepared = prepareReview({ repo: repository, runRoot })
  const item = loadManifest(prepared).items[0]
  const candidate = writeFindings(root, [
    lineFinding(item.id, { existing_code: 'const mode = "safe"' }),
  ])

  assert.throws(
    () => validateFindings({ run: prepared.run_dir, input: candidate }),
    (error) => error.code === 'FINDING_ANCHOR_MISMATCH',
  )
})

test('diff review line findings must overlap the matching layer change', (t) => {
  const { root, repository, runRoot } = createRepository(t)
  writeFileSync(path.join(repository, 'app.js'), 'const mode = "unsafe"\nrun(mode)\n')
  const prepared = prepareReview({ repo: repository, runRoot })
  const item = loadManifest(prepared).items[0]
  const candidate = writeFindings(root, [
    lineFinding(item.id, {
      start_line: 2,
      end_line: 2,
      existing_code: 'run(mode)',
    }),
  ])

  assert.throws(
    () => validateFindings({ run: prepared.run_dir, input: candidate }),
    (error) => error.code === 'FINDING_NOT_ON_CHANGED_LINE',
  )
})

test('status detects workspace input drift without requiring a state advance', (t) => {
  const { repository, runRoot } = createRepository(t)
  writeFileSync(path.join(repository, 'app.js'), 'const mode = "unsafe"\nrun(mode)\n')
  const prepared = prepareReview({ repo: repository, runRoot })
  writeFileSync(path.join(repository, 'app.js'), 'const mode = "changed-again"\nrun(mode)\n')

  const status = reviewStatus({ run: prepared.run_dir })
  assert.equal(status.status, 'INVALIDATED')
  assert.equal(status.fresh, false)
  assert.match(status.current_input_drift, /app\.js/)
})

test('status detects workspace scope expansion', (t) => {
  const { repository, runRoot } = createRepository(t)
  writeFileSync(path.join(repository, 'app.js'), 'const mode = "unsafe"\nrun(mode)\n')
  const prepared = prepareReview({ repo: repository, runRoot })
  writeFileSync(path.join(repository, 'late.js'), 'export const late = true\n')

  const status = reviewStatus({ run: prepared.run_dir })
  assert.equal(status.status, 'INVALIDATED')
  assert.match(status.invalidation_reason, /untracked/)
})

test('status invalidates a run when executable metadata changes', (t) => {
  const { repository, runRoot } = createRepository(t)
  const appPath = path.join(repository, 'app.js')
  chmodSync(appPath, 0o644)
  writeFileSync(appPath, 'const mode = "unsafe"\nrun(mode)\n')
  const prepared = prepareReview({ repo: repository, runRoot })
  const item = loadManifest(prepared).items.find((candidate) => candidate.path === 'app.js')
  assert.equal(item.after.git_mode, '100644')
  assert.equal(item.after.file_type, 'file')
  chmodSync(appPath, 0o755)

  const status = reviewStatus({ run: prepared.run_dir })

  assert.equal(status.status, 'INVALIDATED')
  assert.equal(status.fresh, false)
  assert.match(status.current_input_drift, /mode/)
})

test('status invalidates a run when a file becomes a symlink with identical bytes', (t) => {
  const { repository, runRoot } = createRepository(t)
  const appPath = path.join(repository, 'app.js')
  writeFileSync(appPath, 'worker.js')
  const prepared = prepareReview({ repo: repository, runRoot, files: ['app.js'] })
  rmSync(appPath)
  symlinkSync('worker.js', appPath)

  const status = reviewStatus({ run: prepared.run_dir })

  assert.equal(status.status, 'INVALIDATED')
  assert.equal(status.fresh, false)
  assert.match(status.current_input_drift, /文件类型/)
})

test('explicit current-state review works without Git or a diff', (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'code-review-current-state-test-'))
  const repository = path.join(root, 'plain-project')
  const runRoot = path.join(root, 'runs')
  mkdirSync(repository)
  writeFileSync(path.join(repository, 'feature.js'), 'export const feature = true\n')
  t.after(() => rmSync(root, { recursive: true, force: true }))

  const prepared = prepareReview({ repo: repository, runRoot, files: ['feature.js'] })
  const manifest = loadManifest(prepared)
  const item = manifest.items[0]
  assert.equal(manifest.target.mode, 'files')
  assert.equal(manifest.target.base_commit, undefined)

  markReviewItem({ run: prepared.run_dir, item: item.id, status: 'reviewed' })
  const candidate = writeFindings(root, [
    lineFinding(item.id, {
      severity: 'P3',
      path: 'feature.js',
      existing_code: 'export const feature = true',
      title: 'Current-state observation',
    }),
  ])
  validateFindings({ run: prepared.run_dir, input: candidate })
  const result = finalizeReview({ run: prepared.run_dir, conclusion: 'APPROVE' })
  assert.equal(result.status, 'COMPLETE')
})

test('oversized current-state files are accounted for without being loaded as reviewable', (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'code-review-large-file-test-'))
  const repository = path.join(root, 'plain-project')
  const runRoot = path.join(root, 'runs')
  mkdirSync(repository)
  writeFileSync(path.join(repository, 'large.js'), Buffer.alloc(8 * 1024 * 1024 + 1, 0x61))
  t.after(() => rmSync(root, { recursive: true, force: true }))

  const prepared = prepareReview({ repo: repository, runRoot, files: ['large.js'] })
  const item = loadManifest(prepared).items[0]

  assert.equal(item.reviewable, false)
  assert.equal(item.excluded_reason, 'file_too_large')
  assert.equal(item.observed_size_bytes, 8 * 1024 * 1024 + 1)
  assert.equal(item.after, null)
  assert.equal(prepared.coverage.excluded, 1)
})

test('prepare emits a compact Agent queue without snapshot digests', (t) => {
  const { repository, runRoot } = createRepository(t)
  const prepared = prepareReview({
    repo: repository,
    runRoot,
    files: ['app.js', 'worker.js'],
  })
  const queueText = readFileSync(prepared.queue_path, 'utf8')
  const queue = JSON.parse(queueText)

  assert.equal(queue.items.length, 2)
  assert.ok(queue.items.every((item) => item.item_id && item.path && item.after?.line_count))
  assert.equal(queueText.includes('sha256'), false)
  assert.equal(queueText.includes('input_digest'), false)
  assert.equal(queueText.includes('scope_digest'), false)
  assert.equal(queueText.includes('snapshots/'), false)
  assert.ok(queueText.length < readFileSync(prepared.manifest_path, 'utf8').length)
})

test('metadata-only changes accept an exact file-level anchor', (t) => {
  const { root, repository, runRoot } = createRepository(t)
  const scriptPath = path.join(repository, 'deploy.sh')
  writeFileSync(scriptPath, '#!/bin/sh\necho deploy\n')
  chmodSync(scriptPath, 0o755)
  git(repository, ['add', 'deploy.sh'])
  git(repository, ['commit', '-qm', 'add executable deploy script'])
  chmodSync(scriptPath, 0o644)

  const prepared = prepareReview({ repo: repository, runRoot })
  const item = loadManifest(prepared).items.find((candidate) => candidate.path === 'deploy.sh')
  assert.deepEqual(item.changed_ranges, { before: [], after: [] })
  assert.deepEqual(item.metadata_changes, ['old mode 100755', 'new mode 100644'])

  markReviewItem({ run: prepared.run_dir, item: item.id, status: 'reviewed' })
  validateFindings({
    run: prepared.run_dir,
    input: writeFindings(root, [metadataFinding(item)]),
  })
  const result = finalizeReview({ run: prepared.run_dir, conclusion: 'REQUEST_CHANGES' })
  assert.equal(result.blocking_finding_count, 1)
})

test('file-level anchors reject metadata not present in the frozen item', (t) => {
  const { root, repository, runRoot } = createRepository(t)
  const scriptPath = path.join(repository, 'deploy.sh')
  writeFileSync(scriptPath, '#!/bin/sh\necho deploy\n')
  chmodSync(scriptPath, 0o755)
  git(repository, ['add', 'deploy.sh'])
  git(repository, ['commit', '-qm', 'add executable deploy script'])
  chmodSync(scriptPath, 0o644)
  const prepared = prepareReview({ repo: repository, runRoot })
  const item = loadManifest(prepared).items[0]

  assert.throws(
    () =>
      validateFindings({
        run: prepared.run_dir,
        input: writeFindings(root, [
          metadataFinding(item, { metadata_changes: ['new mode 100777'] }),
        ]),
      }),
    (error) => error.code === 'FINDING_METADATA_MISMATCH',
  )
})

test('candidate shape is enforced from findings.schema.json', (t) => {
  const { root, repository, runRoot } = createRepository(t)
  writeFileSync(path.join(repository, 'app.js'), 'const mode = "unsafe"\nrun(mode)\n')
  const prepared = prepareReview({ repo: repository, runRoot })
  const item = loadManifest(prepared).items[0]
  const candidate = lineFinding(item.id)
  candidate.unexpected = true

  assert.throws(
    () => validateFindings({ run: prepared.run_dir, input: writeFindings(root, [candidate]) }),
    (error) => error.code === 'FINDING_SCHEMA_FAILED',
  )
})

test('state items must remain an exact projection of Manifest membership', (t) => {
  const { root, repository, runRoot } = createRepository(t)
  const prepared = prepareReview({
    repo: repository,
    runRoot,
    files: ['app.js', 'worker.js'],
  })
  const state = JSON.parse(readFileSync(prepared.state_path, 'utf8'))
  state.items = [
    {
      ...state.items[0],
      status: 'reviewed',
      reason: null,
    },
  ]
  writeFileSync(prepared.state_path, `${JSON.stringify(state, null, 2)}\n`)

  assert.throws(
    () => validateFindings({ run: prepared.run_dir, input: writeFindings(root, []) }),
    (error) => error.code === 'RUN_INTEGRITY_FAILED',
  )
})

test('validate and finalize reject corrupted frozen snapshots even without findings', (t) => {
  const { root, repository, runRoot } = createRepository(t)
  const prepareCompletedRun = () => {
    const prepared = prepareReview({ repo: repository, runRoot, files: ['app.js'] })
    const item = loadManifest(prepared).items[0]
    markReviewItem({ run: prepared.run_dir, item: item.id, status: 'reviewed' })
    return { prepared, item }
  }

  const beforeValidation = prepareCompletedRun()
  writeFileSync(
    path.join(beforeValidation.prepared.run_dir, beforeValidation.item.after.file),
    'corrupted before validation\n',
  )
  assert.throws(
    () =>
      validateFindings({
        run: beforeValidation.prepared.run_dir,
        input: writeFindings(root, []),
      }),
    (error) => error.code === 'SNAPSHOT_INTEGRITY_FAILED',
  )

  const beforeFinalization = prepareCompletedRun()
  validateFindings({
    run: beforeFinalization.prepared.run_dir,
    input: writeFindings(root, []),
  })
  writeFileSync(
    path.join(beforeFinalization.prepared.run_dir, beforeFinalization.item.after.file),
    'corrupted before finalization\n',
  )
  assert.throws(
    () => finalizeReview({ run: beforeFinalization.prepared.run_dir, conclusion: 'APPROVE' }),
    (error) => error.code === 'SNAPSHOT_INTEGRITY_FAILED',
  )
})

test('a stale empty lock left during lock initialization is recoverable', (t) => {
  const { repository, runRoot } = createRepository(t)
  const prepared = prepareReview({ repo: repository, runRoot, files: ['app.js'] })
  const lockPath = path.join(prepared.run_dir, '.state.lock')
  writeFileSync(lockPath, '')
  const staleTime = new Date(Date.now() - 60_000)
  utimesSync(lockPath, staleTime, staleTime)

  const status = reviewStatus({ run: prepared.run_dir })

  assert.equal(status.status, 'PREPARED')
  assert.equal(existsSync(lockPath), false)
})

test('an empty workspace cannot be approved', (t) => {
  const { root, repository, runRoot } = createRepository(t)
  const prepared = prepareReview({ repo: repository, runRoot })
  validateFindings({ run: prepared.run_dir, input: writeFindings(root, []) })

  assert.equal(prepared.coverage.total, 0)
  assert.throws(
    () => finalizeReview({ run: prepared.run_dir, conclusion: 'APPROVE' }),
    (error) => error.code === 'CONCLUSION_BLOCKED',
  )
})

test('three-dot comparison resolves immutable commits and line anchors', (t) => {
  const { root, repository, runRoot } = createRepository(t)
  const base = git(repository, ['rev-parse', 'HEAD'])
  writeFileSync(path.join(repository, 'app.js'), 'const mode = "unsafe"\nrun(mode)\n')
  git(repository, ['add', 'app.js'])
  git(repository, ['commit', '-qm', 'change mode'])
  const head = git(repository, ['rev-parse', 'HEAD'])

  const prepared = prepareReview({ repo: repository, runRoot, base, head })
  const manifest = loadManifest(prepared)
  const item = manifest.items[0]
  assert.equal(manifest.target.mode, 'range')
  assert.equal(manifest.target.base_commit, base)
  assert.equal(manifest.target.head_commit, head)

  markReviewItem({ run: prepared.run_dir, item: item.id, status: 'reviewed' })
  validateFindings({ run: prepared.run_dir, input: writeFindings(root, [lineFinding(item.id)]) })
  const result = finalizeReview({ run: prepared.run_dir, conclusion: 'REQUEST_CHANGES' })
  assert.equal(result.status, 'COMPLETE')
})

test('CLI completes the explicit-file protocol', (t) => {
  const { root, repository, runRoot } = createRepository(t)
  const runCli = (args) =>
    JSON.parse(execFileSync(process.execPath, [SCRIPT_PATH, ...args], { encoding: 'utf8' }))
  const prepared = runCli([
    'prepare', '--repo', repository, '--run-root', runRoot, '--file', 'worker.js',
  ])
  const item = loadManifest(prepared).items[0]
  runCli(['mark', '--run', prepared.run_dir, '--item', item.id, '--status', 'reviewed'])
  runCli(['validate', '--run', prepared.run_dir, '--input', writeFindings(root, [])])
  const result = runCli([
    'finalize', '--run', prepared.run_dir, '--conclusion', 'APPROVE',
  ])
  assert.equal(result.status, 'COMPLETE')
})

test('concurrent CLI marks preserve every successful disposition', async (t) => {
  const { repository, runRoot } = createRepository(t)
  const files = Array.from({ length: 16 }, (_, index) => `parallel-${index}.js`)
  for (const [index, file] of files.entries()) {
    writeFileSync(path.join(repository, file), `export const value = ${index}\n`)
  }
  const prepared = prepareReview({ repo: repository, runRoot, files })

  await Promise.all(
    files.map((file) =>
      execFileAsync(process.execPath, [
        SCRIPT_PATH,
        'mark',
        '--run',
        prepared.run_dir,
        '--path',
        file,
        '--status',
        'reviewed',
      ]),
    ),
  )

  const status = reviewStatus({ run: prepared.run_dir })
  assert.equal(status.coverage.reviewed, files.length)
  assert.equal(status.coverage.pending, 0)
})
