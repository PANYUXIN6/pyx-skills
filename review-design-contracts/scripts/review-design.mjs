#!/usr/bin/env node

import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const skillDirectory = path.dirname(scriptDirectory)
const configPath = path.join(skillDirectory, 'review.config.json')
const referencesDirectory = path.join(skillDirectory, 'references')
const humanRejectionReasonsPath = path.join(
  referencesDirectory,
  'human-rejection-reasons.json',
)

const statusText = Object.freeze({
  CREATED: '评审已创建',
  PACKED: '自洽检查任务已准备',
  SELF_CHECKED: '自洽检查已完成',
  ARCHITECTURE_SHARDED: '架构分片检查已完成',
  ARCHITECTURE_CHECKED: '架构检查已完成',
  CHALLENGED: '对抗验证已完成',
  DETERMINISTICALLY_GATED: '证据门禁已完成',
  AWAITING_HUMAN: '等待人工判断',
  QUEUED: '已进入修复队列',
  CLOSED: '评审已结束',
  FAILED: '评审失败',
  INVALIDATED: '评审已失效',
  VALID: '修复队列校验通过',
  FIX_VERIFICATION_PACKED: '局部修复复核任务已准备',
  FIXES_VERIFIED: '局部修复复核通过',
  FIXES_INCOMPLETE: '局部修复尚未完成',
  FULL_REVIEW_REQUIRED: '需要全量重新审核',
})

const reasonText = Object.freeze({
  NO_ADMISSIBLE_FINDINGS: '没有发现需要人工判断的问题',
  INSUFFICIENT_INPUT: '评审材料不足',
  MODEL_OUTPUT_INVALID: '模型输出不符合约定格式',
  INFRASTRUCTURE_FAILURE: '评审任务执行失败',
  ACCEPTED_FINDINGS_CLOSED: '已接受问题的违反路径均已关闭',
  ACCEPTED_FINDING_REMAINS: '仍有已接受问题未修复',
  FIX_SCOPE_EXCEEDED: '修复影响超出局部复核范围',
})

function fail(message) {
  process.stderr.write(`${message}\n`)
  process.exitCode = 1
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function canonicalize(value) {
  if (typeof value === 'string') {
    return value.normalize('NFC').replaceAll('\r\n', '\n').trim()
  }
  if (Array.isArray(value)) {
    return value.map(canonicalize)
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    )
  }
  return value
}

function findingIdentity(candidate) {
  const quoteHash = sha256(canonicalize(candidate.contract.quote))
  const fingerprint = canonicalize({
    contract: {
      source: candidate.contract.source,
      heading: candidate.contract.heading,
      quote_hash: quoteHash,
    },
    trigger: candidate.trigger,
    violation: candidate.violation,
  })
  return {
    findingId: sha256(JSON.stringify(fingerprint)),
    fingerprint,
    quoteHash,
  }
}

function resolveJsonPointer(document, pointer) {
  if (pointer === '' || pointer === '#') {
    return document
  }
  const pathParts = pointer
    .replace(/^#\//, '')
    .split('/')
    .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'))
  let value = document
  for (const part of pathParts) {
    value = value?.[part]
  }
  if (value === undefined) {
    throw new Error(`无法解析 Schema 引用：${pointer}`)
  }
  return value
}

function bundleSchema(schemaFileName) {
  const cache = new Map()

  function loadSchema(filePath) {
    if (!cache.has(filePath)) {
      cache.set(filePath, JSON.parse(readFileSync(filePath, 'utf8')))
    }
    return cache.get(filePath)
  }

  function expand(node, currentFile, currentRoot) {
    if (Array.isArray(node)) {
      return node.map((item) => expand(item, currentFile, currentRoot))
    }
    if (!node || typeof node !== 'object') {
      return node
    }
    if (typeof node.$ref === 'string') {
      const [filePart, fragment = ''] = node.$ref.split('#', 2)
      const targetFile = filePart
        ? path.resolve(path.dirname(currentFile), filePart)
        : currentFile
      const targetRoot = filePart ? loadSchema(targetFile) : currentRoot
      const targetNode = resolveJsonPointer(
        targetRoot,
        fragment ? `#${fragment}` : '#',
      )
      return expand(targetNode, targetFile, targetRoot)
    }
    return Object.fromEntries(
      Object.entries(node).map(([key, value]) => [
        key,
        expand(value, currentFile, currentRoot),
      ]),
    )
  }

  const schemaPath = path.join(referencesDirectory, schemaFileName)
  const root = loadSchema(schemaPath)
  return expand(root, schemaPath, root)
}

function validateAgainstSchema(value, schema, location = '$') {
  if (schema.oneOf) {
    const branchErrors = schema.oneOf.map((branch) =>
      validateAgainstSchema(value, branch, location),
    )
    if (branchErrors.filter((errors) => errors.length === 0).length !== 1) {
      return [`${location} 不满足且仅满足一个 oneOf 分支`]
    }
    return []
  }

  const errors = []
  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${location} 必须等于 ${JSON.stringify(schema.const)}`)
    return errors
  }
  if (
    schema.enum &&
    !schema.enum.some((item) => JSON.stringify(item) === JSON.stringify(value))
  ) {
    errors.push(`${location} 不在允许枚举中`)
    return errors
  }

  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return [`${location} 必须是对象`]
    }
    for (const requiredProperty of schema.required ?? []) {
      if (!Object.hasOwn(value, requiredProperty)) {
        errors.push(`${location}.${requiredProperty} 是必填字段`)
      }
    }
    const allowedProperties = schema.properties ?? {}
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(allowedProperties, key)) {
          errors.push(`${location}.${key} 是未声明字段`)
        }
      }
    }
    for (const [key, propertySchema] of Object.entries(allowedProperties)) {
      if (Object.hasOwn(value, key)) {
        errors.push(
          ...validateAgainstSchema(
            value[key],
            propertySchema,
            `${location}.${key}`,
          ),
        )
      }
    }
  } else if (schema.type === 'array') {
    if (!Array.isArray(value)) {
      return [`${location} 必须是数组`]
    }
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${location} 至少需要 ${schema.minItems} 项`)
    }
    if (schema.items) {
      value.forEach((item, index) => {
        errors.push(
          ...validateAgainstSchema(item, schema.items, `${location}[${index}]`),
        )
      })
    }
  } else if (schema.type === 'string') {
    if (typeof value !== 'string') {
      return [`${location} 必须是字符串`]
    }
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${location} 长度不足`)
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${location} 格式不匹配`)
    }
  }
  return errors
}

function assertSchema(value, schemaFileName, label) {
  const errors = validateAgainstSchema(value, bundleSchema(schemaFileName))
  if (errors.length > 0) {
    throw new Error(`${label} 不满足 Schema：${errors.join('；')}`)
  }
}

function loadHumanRejectionReasons() {
  const reasons = JSON.parse(readFileSync(humanRejectionReasonsPath, 'utf8'))
  if (!Array.isArray(reasons) || reasons.length === 0) {
    throw new Error('human-rejection-reasons.json 必须是非空数组')
  }
  const expectedKeys = [
    'code',
    'default_reason',
    'description',
    'label',
    'number',
  ]
  for (const [index, reason] of reasons.entries()) {
    if (
      !reason ||
      typeof reason !== 'object' ||
      Array.isArray(reason) ||
      JSON.stringify(Object.keys(reason).sort()) !== JSON.stringify(expectedKeys)
    ) {
      throw new Error(`human-rejection-reasons.json 第 ${index + 1} 项结构无效`)
    }
    if (
      reason.number !== index + 1 ||
      !['code', 'label', 'description', 'default_reason'].every(
        (key) => typeof reason[key] === 'string' && reason[key].trim().length > 0,
      )
    ) {
      throw new Error(`human-rejection-reasons.json 第 ${index + 1} 项内容无效`)
    }
  }
  const rejectionSchema = JSON.parse(
    readFileSync(
      path.join(referencesDirectory, 'rejection-record.schema.json'),
      'utf8',
    ),
  )
  const humanBranch = rejectionSchema.oneOf?.find(
    (branch) => branch.properties?.decision_source?.const === 'human',
  )
  const schemaCodes = humanBranch?.properties?.reason_code?.enum
  const reasonCodes = reasons.map((reason) => reason.code)
  if (
    !Array.isArray(schemaCodes) ||
    new Set(reasonCodes).size !== reasonCodes.length ||
    JSON.stringify([...reasonCodes].sort()) !== JSON.stringify([...schemaCodes].sort())
  ) {
    throw new Error(
      'human-rejection-reasons.json 与人工 rejection reason enum 不一致',
    )
  }
  return Object.freeze(reasons.map((reason) => Object.freeze(reason)))
}

const humanRejectionReasons = loadHumanRejectionReasons()

function canonicalPath(repositoryRoot, requestedPath) {
  const absolutePath = path.resolve(repositoryRoot, requestedPath)
  if (!existsSync(absolutePath)) {
    throw new Error(`文件不存在：${requestedPath}`)
  }
  const realPath = realpathSync(absolutePath)
  const relativePath = path.relative(repositoryRoot, realPath)
  if (
    relativePath === '' ||
    relativePath.startsWith(`..${path.sep}`) ||
    relativePath === '..' ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(`路径必须位于仓库内：${requestedPath}`)
  }
  if (!statSync(realPath).isFile()) {
    throw new Error(`路径不是文件：${requestedPath}`)
  }
  return {
    absolutePath: realPath,
    relativePath: relativePath.split(path.sep).join('/'),
  }
}

function canonicalDirectory(repositoryRoot, requestedPath) {
  const absolutePath = path.resolve(repositoryRoot, requestedPath)
  if (!existsSync(absolutePath)) {
    throw new Error(`目录不存在：${requestedPath}`)
  }
  const realPath = realpathSync(absolutePath)
  const relativePath = path.relative(repositoryRoot, realPath)
  if (
    relativePath.startsWith(`..${path.sep}`) ||
    relativePath === '..' ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(`目录必须位于仓库内：${requestedPath}`)
  }
  if (!statSync(realPath).isDirectory()) {
    throw new Error(`路径不是目录：${requestedPath}`)
  }
  return realPath
}

function findRepositoryRoot(startDirectory) {
  let current = realpathSync(startDirectory)
  while (true) {
    if (existsSync(path.join(current, '.git'))) {
      return current
    }
    const parent = path.dirname(current)
    if (parent === current) {
      throw new Error('当前目录不在 Git 仓库中')
    }
    current = parent
  }
}

function parseMarkdownSections(content) {
  const matches = [...content.matchAll(/^(#{1,6})[ \t]+(.+?)\s*$/gm)]
  return matches.map((match, index) => {
    const start = match.index
    const end = matches[index + 1]?.index ?? content.length
    const text = content.slice(start, end).trimEnd()
    return {
      heading: match[2].trim(),
      level: match[1].length,
      sha256: sha256(text),
      content: text,
    }
  })
}

function markdownPreamble(content) {
  const firstHeading = /^(#{1,6})[ \t]+(.+?)\s*$/m.exec(content)
  return firstHeading ? content.slice(0, firstHeading.index) : content
}

function parseAuthorityStatus(content, requestedPath) {
  const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (!frontmatter) {
    return null
  }
  const statusLine = frontmatter[1]
    .split(/\r?\n/)
    .map((line) => line.match(/^authority_status:\s*(\S+)\s*$/))
    .find(Boolean)
  if (!statusLine) {
    return null
  }
  const status = statusLine[1]
  if (!['observed', 'confirmed'].includes(status)) {
    throw new Error(
      `${requestedPath} 的 authority_status 必须是 observed 或 confirmed`,
    )
  }
  return status
}

function loadDocument(repositoryRoot, requestedPath, role) {
  const resolved = canonicalPath(repositoryRoot, requestedPath)
  const content = readFileSync(resolved.absolutePath, 'utf8')
  return {
    role,
    path: resolved.relativePath,
    sha256: sha256(content),
    content,
    sections: parseMarkdownSections(content),
    authority_status: parseAuthorityStatus(content, resolved.relativePath),
  }
}

function projectTaskDocument(document) {
  return {
    role: document.role,
    path: document.path,
    sha256: document.sha256,
    content: document.content,
    authority_status: document.authority_status,
  }
}

function serializedInputBytes(input) {
  return Buffer.byteLength(`${JSON.stringify(input, null, 2)}\n`)
}

function architectureInput(target, supportDocuments, contractLedger) {
  return {
    stage: 'architecture_shard',
    target: projectTaskDocument(target),
    support_documents: supportDocuments,
    contract_ledger: contractLedger,
  }
}

function projectDocumentSections(document, sections, index) {
  const preamble = index === 0 ? markdownPreamble(document.content).trimEnd() : ''
  const content = [preamble, ...sections.map((section) => section.content)]
    .filter(Boolean)
    .join('\n\n')
  return {
    ...projectTaskDocument(document),
    sha256: sha256(content),
    content,
    source_sha256: document.sha256,
    projection: {
      kind: 'section_group',
      index,
      headings: sections.map((section) => section.heading),
    },
  }
}

function splitArchitectureSupportDocument(
  target,
  document,
  contractLedger,
  maxInputBytes,
) {
  const projected = projectTaskDocument(document)
  if (
    serializedInputBytes(architectureInput(target, [projected], contractLedger)) <=
    maxInputBytes
  ) {
    return [projected]
  }
  if (document.sections.length === 0) {
    return [projected]
  }
  const projections = []
  let currentSections = []
  for (const section of document.sections) {
    const candidateSections = [...currentSections, section]
    const candidate = projectDocumentSections(
      document,
      candidateSections,
      projections.length,
    )
    if (
      currentSections.length > 0 &&
      serializedInputBytes(
        architectureInput(target, [candidate], contractLedger),
      ) > maxInputBytes
    ) {
      projections.push(
        projectDocumentSections(document, currentSections, projections.length),
      )
      currentSections = [section]
    } else {
      currentSections = candidateSections
    }
  }
  if (currentSections.length > 0) {
    projections.push(
      projectDocumentSections(document, currentSections, projections.length),
    )
  }
  return projections
}

function createArchitectureShardPlan({
  target,
  supportDocuments,
  contractLedger,
  maxInputBytes,
}) {
  const baseInput = architectureInput(target, [], contractLedger)
  if (serializedInputBytes(baseInput) > maxInputBytes) {
    throw new ReviewFailure(
      'architecture',
      'INSUFFICIENT_INPUT',
      '完整目标与 Contract Ledger 已超过架构分片输入上限',
    )
  }
  const fullInput = {
    stage: 'architecture',
    target: projectTaskDocument(target),
    authorities: supportDocuments
      .filter((document) => document.role === 'authority')
      .map(projectTaskDocument),
    repository_contexts: supportDocuments
      .filter((document) => document.role === 'context')
      .map(projectTaskDocument),
    contract_ledger: contractLedger,
  }
  if (
    supportDocuments.length === 0 ||
    serializedInputBytes(fullInput) <= maxInputBytes
  ) {
    return { mode: 'single', input: fullInput }
  }
  const projections = supportDocuments.flatMap((document) =>
    splitArchitectureSupportDocument(
      target,
      document,
      contractLedger,
      maxInputBytes,
    ),
  )
  const oversizedProjection = projections.find(
    (projection) =>
      serializedInputBytes(
        architectureInput(target, [projection], contractLedger),
      ) > maxInputBytes,
  )
  if (oversizedProjection) {
    throw new ReviewFailure(
      'architecture',
      'INSUFFICIENT_INPUT',
      `支持文档 ${oversizedProjection.path} 包含无法在章节边界内安全切分的超限内容`,
    )
  }
  const groups = []
  let currentGroup = []
  for (const projection of projections) {
    const candidateGroup = [...currentGroup, projection]
    if (
      currentGroup.length > 0 &&
      serializedInputBytes(
        architectureInput(target, candidateGroup, contractLedger),
      ) > maxInputBytes
    ) {
      groups.push(currentGroup)
      currentGroup = [projection]
    } else {
      currentGroup = candidateGroup
    }
  }
  if (currentGroup.length > 0) {
    groups.push(currentGroup)
  }
  return {
    mode: 'sharded',
    shards: groups.map((group, index) => ({
      logical_id: `architecture-shard-${index + 1}`,
      input: architectureInput(target, group, contractLedger),
    })),
  }
}

function dedupeCanonical(items) {
  const fingerprints = new Set()
  return items.filter((item) => {
    const fingerprint = JSON.stringify(canonicalize(item))
    if (fingerprints.has(fingerprint)) {
      return false
    }
    fingerprints.add(fingerprint)
    return true
  })
}

function atomicWriteJson(filePath, value) {
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`)
  renameSync(temporaryPath, filePath)
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function transition(runDirectory, state, status, extra = {}) {
  const nextState = {
    ...state,
    ...extra,
    status,
    updated_at: new Date().toISOString(),
    history: [
      ...state.history,
      {
        status,
        at: new Date().toISOString(),
      },
    ],
  }
  atomicWriteJson(path.join(runDirectory, 'state.json'), nextState)
  return nextState
}

function updateState(runDirectory, state, extra = {}) {
  const nextState = {
    ...state,
    ...extra,
    updated_at: new Date().toISOString(),
  }
  atomicWriteJson(path.join(runDirectory, 'state.json'), nextState)
  return nextState
}

function readJsonOr(filePath, fallback) {
  return existsSync(filePath)
    ? JSON.parse(readFileSync(filePath, 'utf8'))
    : fallback
}

function updateTaskMetric(runDirectory, taskId, patch) {
  const metricsPath = path.join(runDirectory, 'metrics.json')
  const metrics = readJsonOr(metricsPath, {
    version: 1,
    tasks: {},
  })
  metrics.tasks[taskId] = {
    ...metrics.tasks[taskId],
    ...patch,
  }
  atomicWriteJson(metricsPath, metrics)
}

function addHumanReadableResult(result) {
  const state = result.run_dir
    ? readJsonOr(path.join(result.run_dir, 'state.json'), {})
    : {}
  const localizedStatus = statusText[result.status] ?? result.status
  const reasonCode =
    result.completion_reason ??
    result.failure_reason_code ??
    result.retry_reason ??
    state.completion_reason ??
    state.failure_reason_code
  const localizedReason = reasonText[reasonCode]
  const baseSummary = localizedReason
    ? `${localizedStatus}：${localizedReason}`
    : localizedStatus
  const coverageParts = []
  const targetPath = state.coverage?.target ?? state.target_path
  if (targetPath) {
    coverageParts.push(`评审目标：${targetPath}`)
  }
  if (state.coverage?.explicit_authorities?.length) {
    coverageParts.push(
      `显式 authority：${state.coverage.explicit_authorities.join('、')}`,
    )
  }
  if (state.coverage?.observed_contexts?.length) {
    coverageParts.push(
      state.coverage.confirmed_authorities?.length
        ? `架构覆盖包含观察性仓库上下文：${state.coverage.observed_contexts.join('、')}`
        : `架构覆盖依据为目标设计与观察性仓库上下文：${state.coverage.observed_contexts.join('、')}`,
    )
  } else if (state.coverage?.missing_default_documents?.length) {
    coverageParts.push(
      `缺少默认仓库文档：${state.coverage.missing_default_documents.join('、')}`,
    )
  }
  const coverageSummary = coverageParts.join('；') || null

  return {
    ...result,
    human: {
      status: localizedStatus,
      ...(localizedReason ? { reason: localizedReason } : {}),
      summary: [baseSummary, coverageSummary].filter(Boolean).join('；'),
    },
  }
}

function parsePrepareArguments(argumentsList) {
  if (argumentsList.length === 0) {
    throw new Error(
      '用法：review-design.mjs prepare <design.md> [--authority <file>] [--retry-of <run-directory>]',
    )
  }
  const target = argumentsList[0]
  const authorities = []
  let retryOf
  for (let index = 1; index < argumentsList.length; index += 1) {
    const option = argumentsList[index]
    if (option === '--authority') {
      const value = argumentsList[index + 1]
      if (!value) {
        throw new Error('--authority 需要文件路径')
      }
      authorities.push(value)
      index += 1
    } else if (option === '--retry-of') {
      const value = argumentsList[index + 1]
      if (!value) {
        throw new Error('--retry-of 需要旧运行目录')
      }
      retryOf = value
      index += 1
    } else {
      throw new Error(`未知参数：${option}`)
    }
  }
  return { target, authorities, retryOf }
}

function parseFileOption(argumentsList, optionName, usage) {
  if (argumentsList.length !== 3 || argumentsList[1] !== optionName) {
    throw new Error(usage)
  }
  return {
    subject: argumentsList[0],
    file: argumentsList[2],
  }
}

class ReviewFailure extends Error {
  constructor(stage, reasonCode, message) {
    super(message)
    this.stage = stage
    this.reasonCode = reasonCode
  }
}

function validateConfig(config) {
  const requiredLayers = [
    'self_consistency',
    'architecture',
    'adversarial',
  ]
  const requiredTimeouts = [
    'self_consistency',
    'architecture',
    'architecture_merge',
    'adversarial',
    'fix_verification',
    'command',
    'response_grace',
  ]
  if (
    !Number.isInteger(config.architecture_max_input_bytes) ||
    config.architecture_max_input_bytes <= 0 ||
    !Number.isInteger(config.max_parallel_subagents) ||
    config.max_parallel_subagents <= 0 ||
    !Array.isArray(config.authority_files) ||
    !Array.isArray(config.command_allowlist) ||
    !Number.isInteger(config.human_batch_size) ||
    config.human_batch_size <= 0
  ) {
    throw new Error('review.config.json 结构无效')
  }
  for (const timeout of requiredTimeouts) {
    if (
      !Number.isInteger(config.timeouts_ms?.[timeout]) ||
      config.timeouts_ms[timeout] <= 0
    ) {
      throw new Error(`review.config.json 的 ${timeout} 超时配置无效`)
    }
  }
  for (const layer of requiredLayers) {
    const modelConfig = config.models?.[layer]
    if (
      typeof modelConfig?.model !== 'string' ||
      modelConfig.model.length === 0 ||
      typeof modelConfig.reasoning_effort !== 'string' ||
      modelConfig.reasoning_effort.length === 0
    ) {
      throw new Error(`review.config.json 的 ${layer} 模型配置无效`)
    }
  }
}

function rolePrompt(roleFileName, retryMessage) {
  const protocol = readFileSync(
    path.join(referencesDirectory, 'review-protocol.md'),
    'utf8',
  )
  const trustBoundaryStart = protocol.indexOf('## Subagent trust boundary')
  const trustBoundaryEnd = protocol.indexOf('\n## ', trustBoundaryStart + 3)
  if (trustBoundaryStart < 0) {
    throw new Error('review-protocol.md 缺少 Subagent trust boundary')
  }
  const trustBoundary = protocol
    .slice(
      trustBoundaryStart,
      trustBoundaryEnd < 0 ? protocol.length : trustBoundaryEnd,
    )
    .trim()
  const role = readFileSync(
    path.join(referencesDirectory, roleFileName),
    'utf8',
  )
  return [retryMessage ?? '', trustBoundary, role].filter(Boolean).join('\n\n')
}

function createNativeTask({
  runDirectory,
  stage,
  attempt,
  modelConfig,
  roleFileName,
  schemaFileName,
  input,
  logicalId = stage,
  retryMessage = null,
  timeoutMs,
  responseGraceMs,
}) {
  const taskId = `${logicalId}-attempt-${attempt}`
  const taskPath = path.join(runDirectory, 'tasks', taskId)
  mkdirSync(taskPath, { recursive: true })
  const runSuffix = path.basename(runDirectory).split('-').at(-1)
  const stageName = {
    self_consistency: 'l1',
    architecture: 'l2',
    architecture_shard: 'l2s',
    architecture_merge: 'l2m',
    adversarial: 'l3',
    fix_verification: 'fix',
  }[stage]
  const agentTaskName = [
    'review',
    runSuffix,
    stageName,
    sha256(logicalId).slice(0, 10),
    `a${attempt}`,
  ].join('_')
  const inputText = `${JSON.stringify(input, null, 2)}\n`
  const inputSha256 = sha256(inputText)
  const responsePath = path.join(taskPath, 'response.json')
  const spawnMessage = [
    '这是封闭任务，不要调用任何 Skill、Git、Web、MCP 或 Subagent。允许使用 Shell，但仅限当前 task_path 内任务文件的本地读取、response_path 写入和本地 JSON/Schema 校验；不要运行项目命令或访问父级、兄弟目录。',
    `读取 ${path.join(taskPath, 'task.json')} 与同目录 instructions.md，执行其中指定的单一设计评审任务。`,
    `只把最终 JSON 响应写入 ${responsePath}。`,
    `完成后仅报告任务 ${taskId} 已写入响应。`,
  ].join(' ')
  const task = {
    task_id: taskId,
    agent_task_name: agentTaskName,
    logical_id: logicalId,
    stage,
    attempt,
    model: modelConfig.model,
    reasoning_effort: modelConfig.reasoning_effort,
    fork_turns: 'none',
    task_path: taskPath,
    response_path: responsePath,
    input_sha256: inputSha256,
    timeout_ms: timeoutMs,
    response_grace_ms: responseGraceMs,
    spawn_message: spawnMessage,
  }
  const outputSchema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    additionalProperties: false,
    required: ['task_id', 'attempt', 'input_sha256', 'result'],
    properties: {
      task_id: {
        const: taskId,
      },
      attempt: {
        const: attempt,
      },
      input_sha256: {
        const: inputSha256,
      },
      result: bundleSchema(schemaFileName),
    },
  }
  const instructions = [
    '# Native design-review task',
    '',
    'Write exactly one JSON object to the response_path declared in task.json.',
    'The response must satisfy output.schema.json, including the task ownership fields.',
    'Before finishing, re-read response.json and verify it against output.schema.json and the ownership fields in task.json.',
    'Do not edit the target document, authority documents, Skill files, or any other run artifact.',
    '',
    rolePrompt(roleFileName, retryMessage),
    '',
  ].join('\n')
  const outputSchemaText = `${JSON.stringify(outputSchema, null, 2)}\n`
  writeJson(path.join(taskPath, 'task.json'), task)
  writeFileSync(path.join(taskPath, 'input.json'), inputText)
  writeFileSync(path.join(taskPath, 'output.schema.json'), outputSchemaText)
  writeFileSync(path.join(taskPath, 'instructions.md'), instructions)
  updateTaskMetric(runDirectory, taskId, {
    task_id: taskId,
    stage,
    candidate_layer: input.candidate?.layer ?? null,
    attempt,
    created_at: new Date().toISOString(),
    input_bytes: Buffer.byteLength(inputText),
    instructions_bytes: Buffer.byteLength(instructions),
    output_schema_bytes: Buffer.byteLength(outputSchemaText),
    response_bytes: null,
    response_observed_at: null,
    response_valid: null,
  })
  return task
}

function prepareReview(argumentsList) {
  const options = parsePrepareArguments(argumentsList)
  const repositoryRoot = findRepositoryRoot(process.cwd())
  const configText = readFileSync(configPath, 'utf8')
  const config = JSON.parse(configText)
  validateConfig(config)
  const target = loadDocument(repositoryRoot, options.target, 'target')
  let retryOfRunId = null
  if (options.retryOf) {
    const priorRun = loadRun(repositoryRoot, options.retryOf)
    if (!['FAILED', 'INVALIDATED'].includes(priorRun.state.status)) {
      throw new Error(
        `只有 FAILED 或 INVALIDATED 运行可以重试：${priorRun.state.status}`,
      )
    }
    if (priorRun.state.target_path !== target.path) {
      throw new Error('--retry-of 的目标文档与本次运行不一致')
    }
    retryOfRunId = priorRun.state.run_id
  }
  const explicitAuthorities = [...new Set(options.authorities)]
    .map((authorityPath) =>
      loadDocument(repositoryRoot, authorityPath, 'authority'),
    )
    .sort((left, right) => left.path.localeCompare(right.path))
  const explicitAuthorityPaths = new Set(
    explicitAuthorities.map((document) => document.path),
  )
  const defaultDocuments = []
  const missingDefaultDocuments = []
  for (const authorityPath of [...new Set(config.authority_files)].sort()) {
    if (!existsSync(path.resolve(repositoryRoot, authorityPath))) {
      missingDefaultDocuments.push(authorityPath)
      continue
    }
    const document = loadDocument(repositoryRoot, authorityPath, 'authority')
    if (explicitAuthorityPaths.has(document.path)) {
      continue
    }
    if (document.authority_status === 'observed') {
      document.role = 'context'
    }
    defaultDocuments.push(document)
  }
  if (missingDefaultDocuments.length > 0) {
    throw new Error(
      `缺少默认仓库文档：${missingDefaultDocuments.join('、')}。请先使用 repo-map-first 的 repository-context bootstrap 模式`,
    )
  }
  const authorities = [
    ...explicitAuthorities,
    ...defaultDocuments.filter((document) => document.role === 'authority'),
  ].sort((left, right) => left.path.localeCompare(right.path))
  const repositoryContexts = defaultDocuments
    .filter((document) => document.role === 'context')
    .sort((left, right) => left.path.localeCompare(right.path))
  const reviewDocuments = [target, ...authorities, ...repositoryContexts]
  const coverage = {
    target: target.path,
    explicit_authorities: explicitAuthorities.map((document) => document.path),
    confirmed_authorities: authorities.map((document) => document.path),
    observed_contexts: repositoryContexts.map((document) => document.path),
    missing_default_documents: missingDefaultDocuments,
  }
  const inputDigest = sha256(
    JSON.stringify({
      config: sha256(configText),
      documents: reviewDocuments.map((document) => ({
        role: document.role,
        path: document.path,
        sha256: document.sha256,
      })),
    }),
  )
  const runId = createRunId()
  const runDirectory = path.join(
    repositoryRoot,
    '.superpowers',
    'design-reviews',
    target.sha256,
    runId,
  )
  mkdirSync(runDirectory, { recursive: true })
  const createdAt = new Date().toISOString()
  let state = {
    run_id: runId,
    retry_of: retryOfRunId,
    repository_root: repositoryRoot,
    target_path: target.path,
    target_sha256: target.sha256,
    input_digest: inputDigest,
    status: 'CREATED',
    created_at: createdAt,
    updated_at: createdAt,
    quality_flags: [],
    current_batch: null,
    total_batches: 0,
    active_tasks: [],
    task_attempts: {},
    coverage,
    history: [{ status: 'CREATED', at: createdAt }],
  }
  atomicWriteJson(path.join(runDirectory, 'state.json'), state)
  const manifest = {
    version: 7,
    input_digest: inputDigest,
    config_sha256: sha256(configText),
    target_document: target.path,
    documents: reviewDocuments,
    coverage,
    layer_inputs: {
      l1: {
        target: 'full',
        authorities: [],
      },
      l2: {
        target: 'full',
        max_input_bytes: config.architecture_max_input_bytes,
        oversized_strategy: 'support-document-section-shards-plus-merge',
        authorities: authorities.map((authority) => authority.path).sort(),
        repository_contexts: repositoryContexts.map((document) =>
          document.path,
        ),
      },
      l3: {
        self_consistency: {
          documents: 'candidate-cited-sections',
          contract_ledger: 'matching-entries',
        },
        architecture: {
          documents: 'all-review-documents',
          contract_ledger: 'complete',
        },
      },
    },
  }
  writeJson(path.join(runDirectory, 'manifest.json'), manifest)
  const task = createNativeTask({
    runDirectory,
    stage: 'self_consistency',
    attempt: 1,
    modelConfig: config.models.self_consistency,
    roleFileName: 'self-consistency-role.md',
    schemaFileName: 'self-consistency-result.schema.json',
    timeoutMs: config.timeouts_ms.self_consistency,
    responseGraceMs: config.timeouts_ms.response_grace,
    input: {
      stage: 'self_consistency',
      target: projectTaskDocument(target),
    },
  })
  state = transition(runDirectory, state, 'PACKED', {
    active_tasks: [task.task_id],
    task_attempts: {
      self_consistency: 1,
    },
  })
  return {
    status: state.status,
    run_dir: runDirectory,
    tasks: [task],
  }
}

function fixImpact(baselineTarget, currentTarget, queue, supportingInputChanged) {
  const reasons = []
  const addReason = (reason) => {
    if (!reasons.includes(reason)) {
      reasons.push(reason)
    }
  }
  if (queue.some((item) => item.evidence_card.layer === 'architecture')) {
    addReason('ARCHITECTURE_FINDING')
  }
  if (supportingInputChanged) {
    addReason('AUTHORITY_OR_CONTEXT_CHANGED')
  }

  const baselineShape = baselineTarget.sections.map((section) => ({
    heading: section.heading,
    level: section.level,
  }))
  const currentShape = currentTarget.sections.map((section) => ({
    heading: section.heading,
    level: section.level,
  }))
  if (
    JSON.stringify(baselineShape) !== JSON.stringify(currentShape) ||
    sha256(markdownPreamble(baselineTarget.content)) !==
      sha256(markdownPreamble(currentTarget.content))
  ) {
    addReason('DOCUMENT_STRUCTURE_CHANGED')
  }

  const changedSections = []
  const comparableSectionCount = Math.min(
    baselineTarget.sections.length,
    currentTarget.sections.length,
  )
  for (let index = 0; index < comparableSectionCount; index += 1) {
    if (
      baselineTarget.sections[index].sha256 !==
      currentTarget.sections[index].sha256
    ) {
      changedSections.push(currentTarget.sections[index].heading)
    }
  }

  const acceptedHeadings = new Set()
  for (const item of queue) {
    const card = item.evidence_card
    if (card.contract.source !== baselineTarget.path) {
      addReason('CHANGE_OUTSIDE_ACCEPTED_CONTRACTS')
      continue
    }
    acceptedHeadings.add(card.contract.heading)
    const baselineMatches = baselineTarget.sections.filter(
      (section) => section.heading === card.contract.heading,
    )
    const currentMatches = currentTarget.sections.filter(
      (section) => section.heading === card.contract.heading,
    )
    if (baselineMatches.length !== 1 || currentMatches.length !== 1) {
      addReason('DOCUMENT_STRUCTURE_CHANGED')
    }
  }
  if (changedSections.some((heading) => !acceptedHeadings.has(heading))) {
    addReason('CHANGE_OUTSIDE_ACCEPTED_CONTRACTS')
  }

  return {
    review_mode: reasons.length === 0 ? 'targeted' : 'full',
    reasons,
    changed_sections: changedSections,
  }
}

function prepareFixVerification(argumentsList) {
  if (argumentsList.length !== 1) {
    throw new Error('用法：review-design.mjs verify-fixes <run-directory>')
  }
  const repositoryRoot = findRepositoryRoot(process.cwd())
  const sourceRun = loadRun(repositoryRoot, argumentsList[0])
  if (sourceRun.state.status !== 'QUEUED') {
    throw new Error(
      `只有 QUEUED 运行可以启动修复复核：${sourceRun.state.status}`,
    )
  }
  if (sourceRun.manifest.mode === 'fix_verification') {
    throw new Error('修复复核运行不能作为新的修复队列来源')
  }
  const queue = JSON.parse(
    readFileSync(path.join(sourceRun.runDirectory, 'fix-queue.json'), 'utf8'),
  )
  if (!Array.isArray(queue) || queue.length === 0) {
    throw new Error('修复队列为空')
  }
  const queueIds = queue.map((item) => item.finding_id)
  const sourceCards = JSON.parse(
    readFileSync(
      path.join(sourceRun.runDirectory, 'evidence-cards.json'),
      'utf8',
    ),
  )
  const sourceDecisions = JSON.parse(
    readFileSync(path.join(sourceRun.runDirectory, 'decisions.json'), 'utf8'),
  )
  for (const card of sourceCards) {
    assertSchema(card, 'evidence-card.schema.json', '来源 Evidence Card')
  }
  const acceptedIds = new Set(
    sourceDecisions
      .filter((decision) => decision.decision === 'accept')
      .map((decision) => decision.finding_id),
  )
  const expectedQueue = sourceCards
    .filter((card) => acceptedIds.has(card.finding_id))
    .map((card) => ({
      finding_id: card.finding_id,
      target_path: sourceRun.state.target_path,
      target_sha256: sourceRun.state.target_sha256,
      evidence_card: card,
    }))
  if (
    new Set(queueIds).size !== queueIds.length ||
    JSON.stringify(canonicalize(queue)) !==
      JSON.stringify(canonicalize(expectedQueue)) ||
    queue.some(
      (item) =>
        item.target_path !== sourceRun.state.target_path ||
        item.target_sha256 !== sourceRun.state.target_sha256 ||
        item.evidence_card?.finding_id !== item.finding_id,
    )
  ) {
    throw new Error('修复队列与来源运行不一致')
  }

  const baselineTarget = sourceRun.manifest.documents.find(
    (document) => document.role === 'target',
  )
  if (
    sourceRun.manifest.documents.some(
      (document) => sha256(document.content) !== document.sha256,
    )
  ) {
    throw new Error('来源 Manifest 的文档内容摘要不匹配')
  }
  if (!baselineTarget) {
    throw new Error('来源运行缺少目标文档')
  }
  const missingSupportingDocuments = []
  const currentDocuments = []
  for (const document of sourceRun.manifest.documents) {
    if (
      document.role !== 'target' &&
      !existsSync(path.resolve(repositoryRoot, document.path))
    ) {
      missingSupportingDocuments.push(document.path)
      continue
    }
    currentDocuments.push(
      loadDocument(repositoryRoot, document.path, document.role),
    )
  }
  const currentTarget = currentDocuments.find(
    (document) => document.role === 'target',
  )
  if (currentTarget.sha256 === baselineTarget.sha256) {
    throw new Error('目标文档尚未发生变化，没有修复可供复核')
  }

  const configText = readFileSync(configPath, 'utf8')
  const config = JSON.parse(configText)
  validateConfig(config)
  const supportingInputChanged =
    missingSupportingDocuments.length > 0 ||
    sha256(configText) !== sourceRun.manifest.config_sha256 ||
    sourceRun.manifest.documents.some((document) => {
      if (document.role === 'target') {
        return false
      }
      const currentDocument = currentDocuments.find(
        (candidateDocument) => candidateDocument.path === document.path,
      )
      return currentDocument.sha256 !== document.sha256
    })
  const impact = fixImpact(
    baselineTarget,
    currentTarget,
    queue,
    supportingInputChanged,
  )
  const inputDigest = sha256(
    JSON.stringify({
      config: sha256(configText),
      source_run_id: sourceRun.state.run_id,
      source_queue: sha256(JSON.stringify(canonicalize(queue))),
      documents: currentDocuments.map((document) => ({
        role: document.role,
        path: document.path,
        sha256: document.sha256,
      })),
      missing_supporting_documents: missingSupportingDocuments,
    }),
  )
  const runId = createRunId()
  const runDirectory = path.join(
    repositoryRoot,
    '.superpowers',
    'design-reviews',
    currentTarget.sha256,
    runId,
  )
  mkdirSync(runDirectory, { recursive: true })
  const createdAt = new Date().toISOString()
  let state = {
    run_id: runId,
    retry_of: null,
    verification_of: sourceRun.runDirectory,
    repository_root: repositoryRoot,
    target_path: currentTarget.path,
    target_sha256: currentTarget.sha256,
    input_digest: inputDigest,
    status: 'CREATED',
    created_at: createdAt,
    updated_at: createdAt,
    quality_flags: [],
    current_batch: null,
    total_batches: 0,
    active_tasks: [],
    task_attempts: {},
    coverage: sourceRun.state.coverage ?? sourceRun.manifest.coverage,
    history: [{ status: 'CREATED', at: createdAt }],
  }
  atomicWriteJson(path.join(runDirectory, 'state.json'), state)
  writeJson(path.join(runDirectory, 'manifest.json'), {
    version: 6,
    mode: 'fix_verification',
    input_digest: inputDigest,
    config_sha256: sha256(configText),
    target_document: currentTarget.path,
    source_run_id: sourceRun.state.run_id,
    source_target_sha256: baselineTarget.sha256,
    missing_supporting_documents: missingSupportingDocuments,
    documents: currentDocuments,
    coverage: state.coverage,
    accepted_findings: queue.map((item) => item.evidence_card),
  })
  writeJson(path.join(runDirectory, 'fix-impact.json'), impact)

  if (impact.review_mode === 'full') {
    state = transition(runDirectory, state, 'FULL_REVIEW_REQUIRED', {
      completion_reason: 'FIX_SCOPE_EXCEEDED',
      full_review_reasons: impact.reasons,
    })
    return {
      status: state.status,
      run_dir: runDirectory,
      tasks: [],
    }
  }

  const task = createNativeTask({
    runDirectory,
    stage: 'fix_verification',
    attempt: 1,
    modelConfig: config.models.self_consistency,
    roleFileName: 'fix-verification-role.md',
    schemaFileName: 'fix-verification-result.schema.json',
    timeoutMs: config.timeouts_ms.fix_verification,
    responseGraceMs: config.timeouts_ms.response_grace,
    input: {
      stage: 'fix_verification',
      accepted_findings: queue.map((item) => item.evidence_card),
      changed_sections: impact.changed_sections,
      baseline_target: projectTaskDocument(baselineTarget),
      current_target: projectTaskDocument(currentTarget),
    },
  })
  state = transition(runDirectory, state, 'FIX_VERIFICATION_PACKED', {
    active_tasks: [task.task_id],
    task_attempts: {
      fix_verification: 1,
    },
  })
  return {
    status: state.status,
    run_dir: runDirectory,
    tasks: [task],
  }
}

function loadTask(runDirectory, taskId) {
  const taskPath = path.join(runDirectory, 'tasks', taskId, 'task.json')
  if (!existsSync(taskPath)) {
    throw new Error(`任务制品不存在：${taskId}`)
  }
  const task = JSON.parse(readFileSync(taskPath, 'utf8'))
  if (task.task_id !== taskId) {
    throw new Error(`任务归属不匹配：${taskId}`)
  }
  return task
}

function readTaskResponse(task) {
  if (!existsSync(task.response_path)) {
    return null
  }
  const runDirectory = path.dirname(path.dirname(task.task_path))
  const responseText = readFileSync(task.response_path, 'utf8')
  const responseObservedAt = statSync(task.response_path).mtime.toISOString()
  updateTaskMetric(runDirectory, task.task_id, {
    response_bytes: Buffer.byteLength(responseText),
    response_observed_at: responseObservedAt,
  })
  let response
  try {
    response = JSON.parse(responseText)
  } catch (error) {
    updateTaskMetric(runDirectory, task.task_id, {
      response_valid: false,
    })
    const failure = new ReviewFailure(
      task.stage,
      'MODEL_OUTPUT_INVALID',
      `${task.task_id} 响应不是合法 JSON：${error instanceof Error ? error.message : String(error)}`,
    )
    failure.taskId = task.task_id
    throw failure
  }
  const schema = JSON.parse(
    readFileSync(path.join(task.task_path, 'output.schema.json'), 'utf8'),
  )
  const errors = validateAgainstSchema(response, schema)
  if (errors.length > 0) {
    updateTaskMetric(runDirectory, task.task_id, {
      response_valid: false,
    })
    const failure = new ReviewFailure(
      task.stage,
      'MODEL_OUTPUT_INVALID',
      `${task.task_id} 响应不满足 Schema：${errors.join('；')}`,
    )
    failure.taskId = task.task_id
    throw failure
  }
  updateTaskMetric(runDirectory, task.task_id, {
    response_valid: true,
  })
  return response
}

function isInsufficientInput(result) {
  return result?.task_status === 'insufficient_input'
}

function failForInsufficientInput(runDirectory, state, task, result) {
  writeJson(path.join(runDirectory, 'failure.json'), {
    failed_stage: task.stage,
    reason_code: 'INSUFFICIENT_INPUT',
    message: '任务包缺少完成本层评审所需的输入',
    task_id: task.task_id,
    missing_inputs: result.missing_inputs,
  })
  const failed = transition(runDirectory, state, 'FAILED', {
    active_tasks: [],
    failed_stage: task.stage,
    failure_reason_code: 'INSUFFICIENT_INPUT',
  })
  return {
    status: failed.status,
    run_dir: runDirectory,
    tasks: [],
  }
}

function createAdversarialTask({
  runDirectory,
  manifest,
  contractLedger,
  preparedCandidate,
  config,
  attempt,
  retryMessage = null,
}) {
  const citedDocument = manifest.documents.find(
    (document) => document.path === preparedCandidate.cited_section.source,
  )
  const citedSection = citedDocument?.sections.find(
    (section) =>
      section.heading === preparedCandidate.cited_section.heading &&
      section.sha256 === preparedCandidate.cited_section.sha256,
  )
  const isArchitectureCandidate =
    preparedCandidate.candidate.layer === 'architecture'
  return createNativeTask({
    runDirectory,
    stage: 'adversarial',
    attempt,
    modelConfig: config.models.adversarial,
    roleFileName:
      manifest.version >= 5
        ? 'adversarial-role.md'
        : 'adversarial-role-legacy.md',
    schemaFileName:
      manifest.version >= 5
        ? 'adversarial-result.schema.json'
        : 'adversarial-result-legacy.schema.json',
    logicalId: `adversarial-${preparedCandidate.finding_id}`,
    timeoutMs: config.timeouts_ms.adversarial,
    responseGraceMs: config.timeouts_ms.response_grace,
    retryMessage,
    input: {
      stage: 'adversarial',
      candidate: preparedCandidate.candidate,
      cited_sections: citedSection
        ? [
            {
              source: citedDocument.path,
              heading: citedSection.heading,
              sha256: citedSection.sha256,
              content: citedSection.content,
            },
          ]
        : [],
      context_documents: isArchitectureCandidate
        ? manifest.version >= 4
          ? manifest.documents.map(projectTaskDocument)
          : manifest.documents
        : [],
      contract_ledger_entries: isArchitectureCandidate
        ? contractLedger.contracts
        : contractLedger.contracts.filter(
            (entry) =>
              entry.source === preparedCandidate.candidate.contract.source &&
              entry.heading === preparedCandidate.candidate.contract.heading,
          ),
    },
  })
}

function createAdversarialBatch({
  candidates,
  runDirectory,
  manifest,
  contractLedger,
  config,
}) {
  return candidates.map((preparedCandidate) =>
    createAdversarialTask({
      runDirectory,
      manifest,
      contractLedger,
      preparedCandidate,
      config,
      attempt: 1,
    }),
  )
}

function consumeAdversarialResponses({
  taskResponses,
  preparedCandidates,
  documents,
  commandAllowlist,
  adversarialResults,
  rejected,
  evidenceCards,
}) {
  const evidenceFingerprints = new Set(
    evidenceCards.map((card) => card.finding_id),
  )
  for (const { task, response } of taskResponses) {
    const findingId = task.logical_id.replace(/^adversarial-/, '')
    const preparedCandidate = preparedCandidates.find(
      (candidateItem) => candidateItem.finding_id === findingId,
    )
    if (!preparedCandidate) {
      throw new Error(`L3 任务找不到对应候选：${task.task_id}`)
    }
    adversarialResults.push({
      finding_id: preparedCandidate.finding_id,
      result: response.result,
    })
    if (response.result.challenge_outcome === 'refuted') {
      rejected.push(
        automaticRejection(
          preparedCandidate.finding_id,
          'REFUTED_BY_COUNTEREXAMPLE',
          response.result.falsification.counterexample,
        ),
      )
      continue
    }
    const evidenceResult = createEvidenceCard(
      preparedCandidate,
      response.result,
      documents,
      commandAllowlist,
    )
    if (evidenceResult.rejection) {
      rejected.push(evidenceResult.rejection)
      continue
    }
    const card = evidenceResult.card
    if (evidenceFingerprints.has(card.finding_id)) {
      rejected.push(
        automaticRejection(
          card.finding_id,
          'EXACT_DUPLICATE',
          'L3 收敛后与已有 Evidence Card 具有相同指纹',
        ),
      )
      continue
    }
    evidenceFingerprints.add(card.finding_id)
    evidenceCards.push(card)
  }
}

function invalidTaskResult(task, message) {
  const failure = new ReviewFailure(
    task.stage,
    'MODEL_OUTPUT_INVALID',
    `${task.task_id} 响应内容无效：${message}`,
  )
  failure.taskId = task.task_id
  throw failure
}

function requireFullReviewAfterTargetedCheck(run, reason) {
  const impactPath = path.join(run.runDirectory, 'fix-impact.json')
  const impact = JSON.parse(readFileSync(impactPath, 'utf8'))
  impact.review_mode = 'full'
  if (!impact.reasons.includes(reason)) {
    impact.reasons.push(reason)
  }
  writeJson(impactPath, impact)
  const state = transition(
    run.runDirectory,
    run.state,
    'FULL_REVIEW_REQUIRED',
    {
      active_tasks: [],
      completion_reason: 'FIX_SCOPE_EXCEEDED',
      full_review_reasons: impact.reasons,
    },
  )
  return {
    status: state.status,
    run_dir: run.runDirectory,
    tasks: [],
  }
}

function advanceFixVerification(run, repositoryRoot) {
  if (
    [
      'FAILED',
      'INVALIDATED',
      'FIXES_VERIFIED',
      'FIXES_INCOMPLETE',
      'FULL_REVIEW_REQUIRED',
    ].includes(run.state.status)
  ) {
    throw new Error(`当前终态不能继续推进：${run.state.status}`)
  }
  const inputChange = changedInput(run.manifest, repositoryRoot)
  if (inputChange) {
    const invalidated = transition(run.runDirectory, run.state, 'INVALIDATED', {
      invalidation_reason: inputChange,
      active_tasks: [],
    })
    return {
      status: invalidated.status,
      run_dir: run.runDirectory,
      tasks: [],
    }
  }
  if (run.state.status !== 'FIX_VERIFICATION_PACKED') {
    throw new Error(`尚未实现的修复复核推进阶段：${run.state.status}`)
  }
  if (run.state.active_tasks.length !== 1) {
    throw new Error('FIX_VERIFICATION_PACKED 状态必须且只能有一个任务')
  }
  const task = loadTask(run.runDirectory, run.state.active_tasks[0])
  if (task.stage !== 'fix_verification') {
    throw new Error('FIX_VERIFICATION_PACKED 状态的活动任务类型错误')
  }
  const response = readTaskResponse(task)
  if (!response) {
    return {
      status: run.state.status,
      run_dir: run.runDirectory,
      tasks: [],
      waiting_for: [task.task_id],
    }
  }
  if (isInsufficientInput(response.result)) {
    writeJson(
      path.join(run.runDirectory, 'fix-verification-results.json'),
      response.result,
    )
    return requireFullReviewAfterTargetedCheck(
      run,
      'INSUFFICIENT_TARGETED_EVIDENCE',
    )
  }

  const expectedIds = run.manifest.accepted_findings.map(
    (finding) => finding.finding_id,
  )
  const actualIds = response.result.finding_results.map(
    (finding) => finding.finding_id,
  )
  if (
    new Set(actualIds).size !== actualIds.length ||
    actualIds.length !== expectedIds.length ||
    expectedIds.some((findingId) => !actualIds.includes(findingId))
  ) {
    invalidTaskResult(task, 'finding_results 必须且只能覆盖全部已接受 finding')
  }
  writeJson(
    path.join(run.runDirectory, 'fix-verification-results.json'),
    response.result,
  )
  if (
    response.result.scope_assessment.outcome === 'full_review_required'
  ) {
    return requireFullReviewAfterTargetedCheck(
      run,
      'TARGETED_SCOPE_EXPANDED',
    )
  }
  const hasUnresolved = response.result.finding_results.some(
    (finding) => finding.outcome === 'unresolved',
  )
  const state = transition(
    run.runDirectory,
    run.state,
    hasUnresolved ? 'FIXES_INCOMPLETE' : 'FIXES_VERIFIED',
    {
      active_tasks: [],
      completion_reason: hasUnresolved
        ? 'ACCEPTED_FINDING_REMAINS'
        : 'ACCEPTED_FINDINGS_CLOSED',
    },
  )
  return {
    status: state.status,
    run_dir: run.runDirectory,
    tasks: [],
  }
}

function advanceReviewOnce(argumentsList) {
  if (argumentsList.length !== 1) {
    throw new Error('用法：review-design.mjs advance <run-directory>')
  }
  const repositoryRoot = findRepositoryRoot(process.cwd())
  const run = loadRun(repositoryRoot, argumentsList[0])
  if (run.manifest.mode === 'fix_verification') {
    return advanceFixVerification(run, repositoryRoot)
  }
  if (
    ['FAILED', 'INVALIDATED', 'QUEUED', 'CLOSED'].includes(run.state.status)
  ) {
    throw new Error(`当前终态不能继续推进：${run.state.status}`)
  }
  const inputChange = changedInput(run.manifest, repositoryRoot)
  if (inputChange) {
    const invalidated = transition(run.runDirectory, run.state, 'INVALIDATED', {
      invalidation_reason: inputChange,
      active_tasks: [],
    })
    return {
      status: invalidated.status,
      run_dir: run.runDirectory,
      tasks: [],
    }
  }
  const config = JSON.parse(readFileSync(configPath, 'utf8'))
  validateConfig(config)
  if (run.state.status === 'PACKED') {
    if (run.state.active_tasks.length !== 1) {
      throw new Error('PACKED 状态必须且只能有一个 L1 任务')
    }
    const l1Task = loadTask(run.runDirectory, run.state.active_tasks[0])
    if (l1Task.stage !== 'self_consistency') {
      throw new Error('PACKED 状态的活动任务不是 L1')
    }
    const l1Response = readTaskResponse(l1Task)
    if (!l1Response) {
      return {
        status: run.state.status,
        run_dir: run.runDirectory,
        tasks: [],
        waiting_for: [l1Task.task_id],
      }
    }
    if (isInsufficientInput(l1Response.result)) {
      return failForInsufficientInput(
        run.runDirectory,
        run.state,
        l1Task,
        l1Response.result,
      )
    }
    const contractLedger = {
      contracts:
        run.manifest.version >= 4
          ? dedupeCanonical(l1Response.result.contracts)
          : l1Response.result.contracts,
    }
    writeJson(
      path.join(run.runDirectory, 'contract-ledger.json'),
      contractLedger,
    )
    writeJson(path.join(run.runDirectory, 'l1-candidates.json'), {
      candidates: l1Response.result.candidates,
    })
    const l1Layer = enforceCandidateLayer(
      l1Response.result.candidates,
      'self_consistency',
    )
    const preparedL1 = prepareCandidates(
      l1Layer.accepted,
      run.manifest.documents,
      config.command_allowlist,
    )
    preparedL1.rejected.unshift(...l1Layer.rejected)
    writeJson(
      path.join(run.runDirectory, 'candidates.json'),
      preparedL1.accepted,
    )
    writeJson(
      path.join(run.runDirectory, 'rejected.json'),
      preparedL1.rejected,
    )
    writeJson(path.join(run.runDirectory, 'adversarial-results.json'), [])
    writeJson(path.join(run.runDirectory, 'evidence-cards.json'), [])
    const target = run.manifest.documents.find(
      (document) => document.role === 'target',
    )
    const authorities = run.manifest.documents.filter(
      (document) => document.role === 'authority',
    )
    const repositoryContexts = run.manifest.documents.filter(
      (document) => document.role === 'context',
    )
    let architecturePlan = null
    try {
      architecturePlan =
        run.manifest.version >= 7
          ? createArchitectureShardPlan({
              target,
              supportDocuments: [...authorities, ...repositoryContexts],
              contractLedger,
              maxInputBytes: config.architecture_max_input_bytes,
            })
          : null
    } catch (error) {
      if (
        !(error instanceof ReviewFailure) ||
        error.reasonCode !== 'INSUFFICIENT_INPUT'
      ) {
        throw error
      }
      writeJson(path.join(run.runDirectory, 'failure.json'), {
        failed_stage: error.stage,
        reason_code: error.reasonCode,
        message: error.message,
      })
      const failed = transition(run.runDirectory, run.state, 'FAILED', {
        active_tasks: [],
        failed_stage: error.stage,
        failure_reason_code: error.reasonCode,
      })
      return {
        status: failed.status,
        run_dir: run.runDirectory,
        tasks: [],
      }
    }
    if (architecturePlan?.mode === 'sharded') {
      writeJson(
        path.join(run.runDirectory, 'architecture-shard-plan.json'),
        architecturePlan,
      )
      writeJson(
        path.join(run.runDirectory, 'architecture-shard-results.json'),
        [],
      )
      const tasks = createArchitectureShardTasks({
        runDirectory: run.runDirectory,
        shards: architecturePlan.shards,
        startIndex: 0,
        config,
      })
      const taskAttempts = { ...run.state.task_attempts }
      for (const task of tasks) {
        taskAttempts[task.logical_id] = 1
      }
      const state = transition(run.runDirectory, run.state, 'SELF_CHECKED', {
        active_tasks: tasks.map((task) => task.task_id),
        task_attempts: taskAttempts,
        architecture_mode: 'sharded',
        next_architecture_shard_index: tasks.length,
      })
      return {
        status: state.status,
        run_dir: run.runDirectory,
        tasks,
      }
    }
    const l2Task = createNativeTask({
      runDirectory: run.runDirectory,
      stage: 'architecture',
      attempt: 1,
      modelConfig: config.models.architecture,
      roleFileName: 'architecture-role.md',
      schemaFileName: 'candidate-finding.schema.json',
      timeoutMs: config.timeouts_ms.architecture,
      responseGraceMs: config.timeouts_ms.response_grace,
      input:
        architecturePlan?.input ??
        {
          stage: 'architecture',
          target:
            run.manifest.version >= 4 ? projectTaskDocument(target) : target,
          authorities:
            run.manifest.version >= 4
              ? authorities.map(projectTaskDocument)
              : authorities,
          repository_contexts:
            run.manifest.version >= 4
              ? repositoryContexts.map(projectTaskDocument)
              : repositoryContexts,
          contract_ledger: contractLedger,
        },
    })
    const earlyCandidateLimit =
      run.manifest.version >= 4
        ? Math.max(0, config.max_parallel_subagents - 1)
        : 0
    const earlyCandidates = preparedL1.accepted.slice(0, earlyCandidateLimit)
    const earlyTasks = createAdversarialBatch({
      candidates: earlyCandidates,
      runDirectory: run.runDirectory,
      manifest: run.manifest,
      contractLedger,
      config,
    })
    const tasks = [l2Task, ...earlyTasks]
    const taskAttempts = {
      ...run.state.task_attempts,
      architecture: 1,
    }
    for (const task of earlyTasks) {
      taskAttempts[task.logical_id] = 1
    }
    const state = transition(run.runDirectory, run.state, 'SELF_CHECKED', {
      active_tasks: tasks.map((task) => task.task_id),
      task_attempts: taskAttempts,
      next_adversarial_index: earlyTasks.length,
    })
    return {
      status: state.status,
      run_dir: run.runDirectory,
      tasks,
    }
  }
  if (run.state.status === 'SELF_CHECKED') {
    const activeTasks = run.state.active_tasks.map((taskId) =>
      loadTask(run.runDirectory, taskId),
    )
    if (run.state.architecture_mode === 'sharded') {
      if (
        activeTasks.length === 0 ||
        activeTasks.some((task) => task.stage !== 'architecture_shard')
      ) {
        throw new Error('分片 SELF_CHECKED 状态必须只包含 L2 分片任务')
      }
      const waitingFor = activeTasks
        .filter((task) => !existsSync(task.response_path))
        .map((task) => task.task_id)
      if (waitingFor.length > 0) {
        return {
          status: run.state.status,
          run_dir: run.runDirectory,
          tasks: [],
          waiting_for: waitingFor,
        }
      }
      const taskResponses = activeTasks.map((task) => ({
        task,
        response: readTaskResponse(task),
      }))
      const insufficientTask = taskResponses.find(({ response }) =>
        isInsufficientInput(response.result),
      )
      if (insufficientTask) {
        return failForInsufficientInput(
          run.runDirectory,
          run.state,
          insufficientTask.task,
          insufficientTask.response.result,
        )
      }
      const shardResults = readJsonOr(
        path.join(run.runDirectory, 'architecture-shard-results.json'),
        [],
      )
      shardResults.push(
        ...taskResponses.map(({ task, response }) => ({
          logical_id: task.logical_id,
          contracts: response.result.contracts,
          candidates: response.result.candidates,
        })),
      )
      writeJson(
        path.join(run.runDirectory, 'architecture-shard-results.json'),
        shardResults,
      )
      const plan = JSON.parse(
        readFileSync(
          path.join(run.runDirectory, 'architecture-shard-plan.json'),
          'utf8',
        ),
      )
      const nextIndex = run.state.next_architecture_shard_index
      if (nextIndex < plan.shards.length) {
        const tasks = createArchitectureShardTasks({
          runDirectory: run.runDirectory,
          shards: plan.shards,
          startIndex: nextIndex,
          config,
        })
        const taskAttempts = { ...run.state.task_attempts }
        for (const task of tasks) {
          taskAttempts[task.logical_id] = 1
        }
        const state = updateState(run.runDirectory, run.state, {
          active_tasks: tasks.map((task) => task.task_id),
          task_attempts: taskAttempts,
          next_architecture_shard_index: nextIndex + tasks.length,
        })
        return {
          status: state.status,
          run_dir: run.runDirectory,
          tasks,
        }
      }
      const contractLedger = JSON.parse(
        readFileSync(
          path.join(run.runDirectory, 'contract-ledger.json'),
          'utf8',
        ),
      )
      const mergeTask = createNativeTask({
        runDirectory: run.runDirectory,
        stage: 'architecture_merge',
        attempt: 1,
        modelConfig: config.models.architecture,
        roleFileName: 'architecture-merge-role.md',
        schemaFileName: 'candidate-finding.schema.json',
        timeoutMs: config.timeouts_ms.architecture_merge,
        responseGraceMs: config.timeouts_ms.response_grace,
        input: {
          stage: 'architecture_merge',
          target_contract_ledger: contractLedger,
          architecture_contracts: {
            contracts: dedupeCanonical(
              shardResults.flatMap((result) => result.contracts),
            ),
          },
          shard_results: shardResults,
        },
      })
      const state = transition(
        run.runDirectory,
        run.state,
        'ARCHITECTURE_SHARDED',
        {
          active_tasks: [mergeTask.task_id],
          task_attempts: {
            ...run.state.task_attempts,
            architecture_merge: 1,
          },
        },
      )
      return {
        status: state.status,
        run_dir: run.runDirectory,
        tasks: [mergeTask],
      }
    }
    const l2Tasks = activeTasks.filter((task) => task.stage === 'architecture')
    const earlyAdversarialTasks = activeTasks.filter(
      (task) => task.stage === 'adversarial',
    )
    if (
      l2Tasks.length !== 1 ||
      activeTasks.length !== l2Tasks.length + earlyAdversarialTasks.length
    ) {
      throw new Error('SELF_CHECKED 状态必须包含一个 L2 和零到多个 L3 任务')
    }
    const waitingFor = activeTasks
      .filter((task) => !existsSync(task.response_path))
      .map((task) => task.task_id)
    if (waitingFor.length > 0) {
      return {
        status: run.state.status,
        run_dir: run.runDirectory,
        tasks: [],
        waiting_for: waitingFor,
      }
    }
    const taskResponses = activeTasks.map((task) => ({
      task,
      response: readTaskResponse(task),
    }))
    const insufficientTask = taskResponses.find(({ response }) =>
      isInsufficientInput(response.result),
    )
    if (insufficientTask) {
      return failForInsufficientInput(
        run.runDirectory,
        run.state,
        insufficientTask.task,
        insufficientTask.response.result,
      )
    }
    const l2Response = taskResponses.find(
      ({ task }) => task.stage === 'architecture',
    ).response
    const l1Candidates = JSON.parse(
      readFileSync(path.join(run.runDirectory, 'l1-candidates.json'), 'utf8'),
    )
    const contractLedger = JSON.parse(
      readFileSync(path.join(run.runDirectory, 'contract-ledger.json'), 'utf8'),
    )
    const l1Layer = enforceCandidateLayer(
      l1Candidates.candidates,
      'self_consistency',
    )
    const l2Layer = enforceCandidateLayer(
      l2Response.result.candidates,
      'architecture',
    )
    const prepared = prepareCandidates(
      [...l1Layer.accepted, ...l2Layer.accepted],
      run.manifest.documents,
      config.command_allowlist,
    )
    prepared.rejected.unshift(...l1Layer.rejected, ...l2Layer.rejected)
    writeJson(path.join(run.runDirectory, 'candidates.json'), prepared.accepted)
    const earlyTaskResponses = taskResponses.filter(
      ({ task }) => task.stage === 'adversarial',
    )
    const expectedEarlyIds = prepared.accepted
      .slice(0, earlyTaskResponses.length)
      .map((candidateItem) => candidateItem.finding_id)
    const actualEarlyIds = earlyTaskResponses.map(({ task }) =>
      task.logical_id.replace(/^adversarial-/, ''),
    )
    if (JSON.stringify(actualEarlyIds) !== JSON.stringify(expectedEarlyIds)) {
      throw new Error('提前启动的 L3 候选与合并候选前缀不一致')
    }
    const adversarialResults = []
    const rejected = [...prepared.rejected]
    const evidenceCards = []
    consumeAdversarialResponses({
      taskResponses: earlyTaskResponses,
      preparedCandidates: prepared.accepted,
      documents: run.manifest.documents,
      commandAllowlist: config.command_allowlist,
      adversarialResults,
      rejected,
      evidenceCards,
    })
    writeJson(
      path.join(run.runDirectory, 'adversarial-results.json'),
      adversarialResults,
    )
    writeJson(path.join(run.runDirectory, 'rejected.json'), rejected)
    writeJson(path.join(run.runDirectory, 'evidence-cards.json'), evidenceCards)

    const nextIndex = earlyTaskResponses.length
    const nextCandidates = prepared.accepted.slice(
      nextIndex,
      nextIndex + config.max_parallel_subagents,
    )
    const tasks = createAdversarialBatch({
      candidates: nextCandidates,
      runDirectory: run.runDirectory,
      manifest: run.manifest,
      contractLedger,
      config,
    })
    const taskAttempts = {
      ...run.state.task_attempts,
    }
    for (const task of tasks) {
      taskAttempts[task.logical_id] = 1
    }
    const awaitingChallenges = transition(
      run.runDirectory,
      run.state,
      'ARCHITECTURE_CHECKED',
      {
        active_tasks: tasks.map((task) => task.task_id),
        task_attempts: taskAttempts,
        next_adversarial_index: nextIndex + tasks.length,
      },
    )
    if (tasks.length === 0) {
      return finishReview({
        repositoryRoot,
        runDirectory: run.runDirectory,
        state: awaitingChallenges,
        config,
        adversarialResults,
        rejected,
        evidenceCards,
      })
    }
    return {
      status: awaitingChallenges.status,
      run_dir: run.runDirectory,
      tasks,
    }
  }
  if (run.state.status === 'ARCHITECTURE_SHARDED') {
    if (run.state.active_tasks.length !== 1) {
      throw new Error('ARCHITECTURE_SHARDED 状态必须包含一个合并任务')
    }
    const mergeTask = loadTask(
      run.runDirectory,
      run.state.active_tasks[0],
    )
    if (mergeTask.stage !== 'architecture_merge') {
      throw new Error('ARCHITECTURE_SHARDED 活动任务不是架构合并任务')
    }
    const mergeResponse = readTaskResponse(mergeTask)
    if (!mergeResponse) {
      return {
        status: run.state.status,
        run_dir: run.runDirectory,
        tasks: [],
        waiting_for: [mergeTask.task_id],
      }
    }
    if (isInsufficientInput(mergeResponse.result)) {
      return failForInsufficientInput(
        run.runDirectory,
        run.state,
        mergeTask,
        mergeResponse.result,
      )
    }
    const shardResults = JSON.parse(
      readFileSync(
        path.join(run.runDirectory, 'architecture-shard-results.json'),
        'utf8',
      ),
    )
    return proceedFromArchitectureCandidates({
      repositoryRoot,
      run,
      config,
      architectureCandidates: [
        ...shardResults.flatMap((result) => result.candidates),
        ...mergeResponse.result.candidates,
      ],
    })
  }
  if (run.state.status === 'ARCHITECTURE_CHECKED') {
    const activeTasks = run.state.active_tasks.map((taskId) =>
      loadTask(run.runDirectory, taskId),
    )
    const waitingFor = activeTasks
      .filter((task) => !existsSync(task.response_path))
      .map((task) => task.task_id)
    if (waitingFor.length > 0) {
      return {
        status: run.state.status,
        run_dir: run.runDirectory,
        tasks: [],
        waiting_for: waitingFor,
      }
    }
    for (const task of activeTasks) {
      if (task.stage !== 'adversarial') {
        throw new Error(
          `ARCHITECTURE_CHECKED 状态包含非 L3 任务：${task.task_id}`,
        )
      }
    }
    const taskResponses = activeTasks.map((task) => ({
      task,
      response: readTaskResponse(task),
    }))
    const insufficientTask = taskResponses.find(({ response }) =>
      isInsufficientInput(response.result),
    )
    if (insufficientTask) {
      return failForInsufficientInput(
        run.runDirectory,
        run.state,
        insufficientTask.task,
        insufficientTask.response.result,
      )
    }
    const preparedCandidates = JSON.parse(
      readFileSync(path.join(run.runDirectory, 'candidates.json'), 'utf8'),
    )
    const contractLedger = JSON.parse(
      readFileSync(path.join(run.runDirectory, 'contract-ledger.json'), 'utf8'),
    )
    const adversarialResults = readJsonOr(
      path.join(run.runDirectory, 'adversarial-results.json'),
      [],
    )
    const rejected = readJsonOr(
      path.join(run.runDirectory, 'rejected.json'),
      [],
    )
    const evidenceCards = readJsonOr(
      path.join(run.runDirectory, 'evidence-cards.json'),
      [],
    )
    consumeAdversarialResponses({
      taskResponses,
      preparedCandidates,
      documents: run.manifest.documents,
      commandAllowlist: config.command_allowlist,
      adversarialResults,
      rejected,
      evidenceCards,
    })
    writeJson(
      path.join(run.runDirectory, 'adversarial-results.json'),
      adversarialResults,
    )
    writeJson(path.join(run.runDirectory, 'rejected.json'), rejected)
    writeJson(path.join(run.runDirectory, 'evidence-cards.json'), evidenceCards)

    const nextIndex = run.state.next_adversarial_index
    const nextCandidates = preparedCandidates.slice(
      nextIndex,
      nextIndex + config.max_parallel_subagents,
    )
    if (nextCandidates.length > 0) {
      const tasks = createAdversarialBatch({
        candidates: nextCandidates,
        runDirectory: run.runDirectory,
        manifest: run.manifest,
        contractLedger,
        config,
      })
      const taskAttempts = {
        ...run.state.task_attempts,
      }
      for (const task of tasks) {
        taskAttempts[task.logical_id] = 1
      }
      const state = updateState(run.runDirectory, run.state, {
        active_tasks: tasks.map((task) => task.task_id),
        task_attempts: taskAttempts,
        next_adversarial_index: nextIndex + tasks.length,
      })
      return {
        status: state.status,
        run_dir: run.runDirectory,
        tasks,
      }
    }
    return finishReview({
      repositoryRoot,
      runDirectory: run.runDirectory,
      state: run.state,
      config,
      adversarialResults,
      rejected,
      evidenceCards,
    })
  }
  throw new Error(`尚未实现的推进阶段：${run.state.status}`)
}

function retryNativeTask(
  runDirectory,
  task,
  config,
  validationMessage,
  manifestVersion,
) {
  const stageSettings = {
    self_consistency: {
      modelConfig: config.models.self_consistency,
      roleFileName: 'self-consistency-role.md',
      schemaFileName: 'self-consistency-result.schema.json',
      timeoutMs: config.timeouts_ms.self_consistency,
      responseGraceMs: config.timeouts_ms.response_grace,
    },
    architecture: {
      modelConfig: config.models.architecture,
      roleFileName: 'architecture-role.md',
      schemaFileName: 'candidate-finding.schema.json',
      timeoutMs: config.timeouts_ms.architecture,
      responseGraceMs: config.timeouts_ms.response_grace,
    },
    architecture_shard: {
      modelConfig: config.models.architecture,
      roleFileName: 'architecture-shard-role.md',
      schemaFileName: 'architecture-shard-result.schema.json',
      timeoutMs: config.timeouts_ms.architecture,
      responseGraceMs: config.timeouts_ms.response_grace,
    },
    architecture_merge: {
      modelConfig: config.models.architecture,
      roleFileName: 'architecture-merge-role.md',
      schemaFileName: 'candidate-finding.schema.json',
      timeoutMs: config.timeouts_ms.architecture_merge,
      responseGraceMs: config.timeouts_ms.response_grace,
    },
    adversarial: {
      modelConfig: config.models.adversarial,
      roleFileName:
        manifestVersion >= 5
          ? 'adversarial-role.md'
          : 'adversarial-role-legacy.md',
      schemaFileName:
        manifestVersion >= 5
          ? 'adversarial-result.schema.json'
          : 'adversarial-result-legacy.schema.json',
      timeoutMs: config.timeouts_ms.adversarial,
      responseGraceMs: config.timeouts_ms.response_grace,
    },
    fix_verification: {
      modelConfig: config.models.self_consistency,
      roleFileName: 'fix-verification-role.md',
      schemaFileName: 'fix-verification-result.schema.json',
      timeoutMs: config.timeouts_ms.fix_verification,
      responseGraceMs: config.timeouts_ms.response_grace,
    },
  }
  const settings = stageSettings[task.stage]
  if (!settings) {
    throw new Error(`未知任务阶段：${task.stage}`)
  }
  const input = JSON.parse(
    readFileSync(path.join(task.task_path, 'input.json'), 'utf8'),
  )
  return createNativeTask({
    runDirectory,
    stage: task.stage,
    attempt: task.attempt + 1,
    logicalId: task.logical_id,
    input,
    retryMessage: `上一次独立响应未通过确定性校验：${validationMessage}。重新执行任务，不复用上次答案。`,
    ...settings,
  })
}

function advanceReview(argumentsList) {
  try {
    return advanceReviewOnce(argumentsList)
  } catch (error) {
    if (
      !(error instanceof ReviewFailure) ||
      error.reasonCode !== 'MODEL_OUTPUT_INVALID' ||
      argumentsList.length !== 1
    ) {
      throw error
    }
    const repositoryRoot = findRepositoryRoot(process.cwd())
    const run = loadRun(repositoryRoot, argumentsList[0])
    const taskId = error.taskId
    if (!taskId || !run.state.active_tasks.includes(taskId)) {
      throw error
    }
    const task = loadTask(run.runDirectory, taskId)
    if (task.attempt >= 2) {
      writeJson(path.join(run.runDirectory, 'failure.json'), {
        failed_stage: error.stage,
        reason_code: error.reasonCode,
        message: error.message,
        task_id: task.task_id,
      })
      transition(run.runDirectory, run.state, 'FAILED', {
        active_tasks: [],
        failed_stage: error.stage,
        failure_reason_code: error.reasonCode,
      })
      throw error
    }
    renameSync(
      task.response_path,
      path.join(task.task_path, 'response.invalid.json'),
    )
    const config = JSON.parse(readFileSync(configPath, 'utf8'))
    validateConfig(config)
    const retryTask = retryNativeTask(
      run.runDirectory,
      task,
      config,
      error.message,
      run.manifest.version,
    )
    const activeTasks = run.state.active_tasks.map((activeTaskId) =>
      activeTaskId === task.task_id ? retryTask.task_id : activeTaskId,
    )
    const state = updateState(run.runDirectory, run.state, {
      active_tasks: activeTasks,
      task_attempts: {
        ...run.state.task_attempts,
        [task.logical_id]: retryTask.attempt,
      },
    })
    return {
      status: state.status,
      run_dir: run.runDirectory,
      tasks: [retryTask],
      retry_reason: 'MODEL_OUTPUT_INVALID',
    }
  }
}

function failTask(argumentsList) {
  if (
    argumentsList.length !== 5 ||
    argumentsList[1] !== '--task' ||
    argumentsList[3] !== '--message'
  ) {
    throw new Error(
      '用法：review-design.mjs fail-task <run-directory> --task <task-id> --message <diagnostic>',
    )
  }
  const [requestedRunDirectory, , taskId, , message] = argumentsList
  if (message.trim().length === 0) {
    throw new Error('--message 不能为空')
  }
  const repositoryRoot = findRepositoryRoot(process.cwd())
  const run = loadRun(repositoryRoot, requestedRunDirectory)
  if (
    [
      'FAILED',
      'INVALIDATED',
      'QUEUED',
      'CLOSED',
      'FIXES_VERIFIED',
      'FIXES_INCOMPLETE',
      'FULL_REVIEW_REQUIRED',
    ].includes(run.state.status)
  ) {
    throw new Error(`当前终态不能记录任务失败：${run.state.status}`)
  }
  if (!run.state.active_tasks.includes(taskId)) {
    throw new Error(`任务不是当前活动任务：${taskId}`)
  }
  const task = loadTask(run.runDirectory, taskId)
  if (existsSync(task.response_path)) {
    return {
      status: run.state.status,
      run_dir: run.runDirectory,
      tasks: [],
      response_available: true,
    }
  }
  const diagnostic = message.trim().slice(0, 4000)
  writeJson(path.join(run.runDirectory, 'failure.json'), {
    failed_stage: task.stage,
    reason_code: 'INFRASTRUCTURE_FAILURE',
    message: diagnostic,
    task_id: task.task_id,
  })
  const state = transition(run.runDirectory, run.state, 'FAILED', {
    active_tasks: [],
    failed_stage: task.stage,
    failure_reason_code: 'INFRASTRUCTURE_FAILURE',
  })
  return {
    status: state.status,
    run_dir: run.runDirectory,
    tasks: [],
  }
}

function automaticRejection(findingId, reasonCode, details) {
  const rejection = {
    finding_id: findingId,
    decision_source: 'automatic',
    reason_code: reasonCode,
    details,
  }
  assertSchema(rejection, 'rejection-record.schema.json', '自动拒绝记录')
  return rejection
}

function enforceCandidateLayer(candidates, expectedLayer) {
  const accepted = []
  const rejected = []
  for (const candidate of candidates) {
    if (candidate.layer === expectedLayer) {
      accepted.push(candidate)
      continue
    }
    rejected.push(
      automaticRejection(
        findingIdentity(candidate).findingId,
        'OUT_OF_SCOPE_OPINION',
        `候选由错误层级提交：期望 ${expectedLayer}，实际 ${candidate.layer}`,
      ),
    )
  }
  return { accepted, rejected }
}

function prepareCandidates(rawCandidates, documents, commandAllowlist) {
  const accepted = []
  const rejected = []
  const fingerprints = new Set()
  const documentsByPath = new Map(
    documents.map((document) => [document.path, document]),
  )

  for (const candidate of rawCandidates) {
    const identity = findingIdentity(candidate)
    const document = documentsByPath.get(candidate.contract.source)
    if (!document) {
      rejected.push(
        automaticRejection(
          identity.findingId,
          'REFERENCE_NOT_IN_PACK',
          `引用文件不在 Context Pack：${candidate.contract.source}`,
        ),
      )
      continue
    }
    if (document.role === 'context') {
      rejected.push(
        automaticRejection(
          identity.findingId,
          'NO_PROJECT_CONTRACT',
          `观察性仓库上下文不能作为正式契约来源：${candidate.contract.source}`,
        ),
      )
      continue
    }
    const sections = document.sections.filter(
      (item) => item.heading === candidate.contract.heading,
    )
    if (sections.length === 0) {
      rejected.push(
        automaticRejection(
          identity.findingId,
          'REFERENCE_NOT_IN_PACK',
          `引用章节不在 Context Pack：${candidate.contract.heading}`,
        ),
      )
      continue
    }
    const section = sections.find((item) =>
      item.content.includes(candidate.contract.quote),
    )
    if (!section) {
      rejected.push(
        automaticRejection(
          identity.findingId,
          'QUOTE_MISMATCH',
          '契约原文无法在引用章节中逐字匹配',
        ),
      )
      continue
    }
    if (
      candidate.verification.mode === 'executable' &&
      !commandAllowlist.includes(candidate.verification.procedure)
    ) {
      rejected.push(
        automaticRejection(
          identity.findingId,
          'COMMAND_NOT_ALLOWLISTED',
          '验证命令与 review.config.json 白名单不完全匹配',
        ),
      )
      continue
    }
    const fingerprintKey = JSON.stringify(identity.fingerprint)
    if (fingerprints.has(fingerprintKey)) {
      rejected.push(
        automaticRejection(
          identity.findingId,
          'EXACT_DUPLICATE',
          '同一运行中已存在完全相同的确定性指纹',
        ),
      )
      continue
    }
    fingerprints.add(fingerprintKey)
    accepted.push({
      finding_id: identity.findingId,
      quote_hash: identity.quoteHash,
      cited_section: {
        source: document.path,
        heading: section.heading,
        sha256: section.sha256,
      },
      candidate,
    })
  }
  return { accepted, rejected }
}

function createRunId() {
  const timestamp = new Date().toISOString().replaceAll(/[-:.TZ]/g, '')
  return `${timestamp}-${randomUUID().slice(0, 8)}`
}

function sameCandidateSubject(originalCandidate, refinedCandidate) {
  return (
    originalCandidate.layer === refinedCandidate.layer &&
    JSON.stringify(canonicalize(originalCandidate.contract)) ===
      JSON.stringify(canonicalize(refinedCandidate.contract))
  )
}

function createEvidenceCard(
  preparedCandidate,
  adversarialResult,
  documents,
  commandAllowlist,
) {
  let refinedCandidate
  if (adversarialResult.refined_finding) {
    refinedCandidate = adversarialResult.refined_finding
    if (!sameCandidateSubject(preparedCandidate.candidate, refinedCandidate)) {
      return {
        rejection: automaticRejection(
          preparedCandidate.finding_id,
          'INCOMPLETE_CHALLENGE_EVIDENCE',
          'L3 改变了候选来源层或契约引用',
        ),
      }
    }
  } else {
    refinedCandidate = {
      ...preparedCandidate.candidate,
      ...(adversarialResult.refinement ?? {}),
    }
  }
  const refined = prepareCandidates(
    [refinedCandidate],
    documents,
    commandAllowlist,
  )
  if (refined.accepted.length !== 1) {
    return {
      rejection: refined.rejected[0],
    }
  }
  const preparedRefinedCandidate = refined.accepted[0]
  const card = {
    finding_id: preparedRefinedCandidate.finding_id,
    layer: refinedCandidate.layer,
    claim: refinedCandidate.claim,
    contract: {
      ...refinedCandidate.contract,
      quote_hash: preparedRefinedCandidate.quote_hash,
    },
    trigger: refinedCandidate.trigger,
    violation: refinedCandidate.violation,
    verification: refinedCandidate.verification,
    falsification: {
      attempt: adversarialResult.falsification.attempt,
      remaining_evidence: adversarialResult.falsification.remaining_evidence,
    },
  }
  assertSchema(card, 'evidence-card.schema.json', 'Evidence Card')
  return { card }
}

function sortEvidenceCards(cards) {
  return [...cards].sort((left, right) => {
    const leftKey = [
      left.contract.source,
      left.contract.heading,
      left.contract.quote_hash,
      left.finding_id,
    ].join('\u0000')
    const rightKey = [
      right.contract.source,
      right.contract.heading,
      right.contract.quote_hash,
      right.finding_id,
    ].join('\u0000')
    return leftKey.localeCompare(rightKey)
  })
}

function executeAllowlistedVerifications(cards, config, repositoryRoot) {
  return cards
    .filter((card) => card.verification.mode === 'executable')
    .map((card) => {
      const command = card.verification.procedure
      if (!config.command_allowlist.includes(command)) {
        throw new ReviewFailure(
          'deterministic_gate',
          'INFRASTRUCTURE_FAILURE',
          `执行前白名单复核失败：${command}`,
        )
      }
      const result = spawnSync('/bin/sh', ['-lc', command], {
        cwd: repositoryRoot,
        encoding: 'utf8',
        timeout: config.timeouts_ms.command,
        env: {
          LANG: 'C',
          PATH: process.env.PATH ?? '',
        },
      })
      if (result.error || result.status === null) {
        throw new ReviewFailure(
          'deterministic_gate',
          'INFRASTRUCTURE_FAILURE',
          result.error?.message ?? `验证命令被信号终止：${result.signal}`,
        )
      }
      const stdout = result.stdout ?? ''
      const stderr = result.stderr ?? ''
      return {
        finding_id: card.finding_id,
        command,
        exit_code: result.status,
        stdout_sha256: sha256(stdout),
        stdout_length: Buffer.byteLength(stdout),
        stderr_sha256: sha256(stderr),
        stderr_length: Buffer.byteLength(stderr),
      }
    })
}

function renderHumanReview(cards, currentBatch, batchSize, coverage) {
  if (cards.length === 0) {
    return '# 设计评审\n\n没有候选意见需要人工仲裁。\n'
  }
  const totalBatches = Math.ceil(cards.length / batchSize)
  const startIndex = (currentBatch - 1) * batchSize
  const batch = cards.slice(startIndex, startIndex + batchSize)
  const sections = batch.map((card, index) => {
    const initialState = card.trigger.initial_state
      .map((item) => `  - ${item}`)
      .join('\n')
    const steps = card.trigger.steps
      .map(
        (step, stepIndex) =>
          `  ${stepIndex + 1}. ${step.actor}：${step.action} → ${step.result}`,
      )
      .join('\n')
    return [
      `## 发现 ${index + 1}`,
      '',
      `<!-- finding_id: ${card.finding_id} -->`,
      '',
      `结论：${card.claim}`,
      '',
      `契约来源：${card.contract.source} · ${card.contract.heading}`,
      '',
      `契约原文：${card.contract.quote}`,
      '',
      '初始状态：',
      initialState,
      '',
      '触发步骤：',
      steps,
      '',
      `推导结果：${card.trigger.derived_outcome}`,
      '',
      `契约违反：期望「${card.violation.expected}」，实际「${card.violation.actual}」`,
      '',
      `对抗检查：尝试「${card.falsification.attempt}」；仍有证据「${card.falsification.remaining_evidence}」`,
      '',
      `验证方法与 Oracle：${card.verification.procedure}；成立标志为「${card.verification.oracle}」`,
    ].join('\n')
  })
  const coverageLines = []
  if (coverage?.target) {
    coverageLines.push(`评审目标：${coverage.target}`)
  }
  if (coverage?.explicit_authorities?.length) {
    coverageLines.push(
      `显式 authority：${coverage.explicit_authorities.join('、')}`,
    )
  }
  if (coverage?.observed_contexts?.length) {
    coverageLines.push(
      coverage.confirmed_authorities?.length
        ? `架构检查使用了观察性仓库上下文：${coverage.observed_contexts.join('、')}。这些文档不能替代已确认的架构契约。`
        : `当前没有已确认的仓库 authority；架构检查仅依据目标设计与观察性仓库上下文：${coverage.observed_contexts.join('、')}。这些文档不能替代已确认的架构契约。`,
    )
  }
  const coverageSection = coverageLines.length
    ? ['## 覆盖说明', '', ...coverageLines, '']
    : []
  const rejectionReasons = humanRejectionReasons.flatMap((reason) => [
    `${reason.number}. ${reason.label}：${reason.description}`,
  ])
  return [
    '# 设计评审',
    '',
    `当前批次：${currentBatch}/${totalBatches}`,
    '',
    '只回答：是否存在可验证的契约违反路径？',
    '',
    ...coverageSection,
    ...sections,
    '',
    '## 如何决策',
    '',
    '请使用上面的“发现 1、发现 2……”编号逐条回复：',
    '',
    '- 确认存在违反路径',
    '- 驳回此发现',
    '- 先解释当前证据',
    '',
    '选择“驳回此发现”时，可以回复下面的原因编号，也可以直接说明原因：',
    '',
    ...rejectionReasons,
    '',
  ].join('\n')
}

function finishReview({
  repositoryRoot,
  runDirectory,
  state: startingState,
  config,
  adversarialResults,
  rejected,
  evidenceCards,
}) {
  writeJson(
    path.join(runDirectory, 'adversarial-results.json'),
    adversarialResults,
  )
  writeJson(path.join(runDirectory, 'rejected.json'), rejected)
  let state = transition(runDirectory, startingState, 'CHALLENGED', {
    active_tasks: [],
  })
  const sortedEvidenceCards = sortEvidenceCards(evidenceCards)
  const verificationResults = executeAllowlistedVerifications(
    sortedEvidenceCards,
    config,
    repositoryRoot,
  )
  writeJson(
    path.join(runDirectory, 'verification-results.json'),
    verificationResults,
  )
  writeJson(path.join(runDirectory, 'evidence-cards.json'), sortedEvidenceCards)
  state = transition(runDirectory, state, 'DETERMINISTICALLY_GATED')
  writeJson(path.join(runDirectory, 'decisions.json'), [])
  writeJson(path.join(runDirectory, 'fix-queue.json'), [])

  if (sortedEvidenceCards.length === 0) {
    state = transition(runDirectory, state, 'CLOSED', {
      completion_reason: 'NO_ADMISSIBLE_FINDINGS',
      current_batch: null,
      total_batches: 0,
    })
    return {
      status: state.status,
      run_dir: runDirectory,
      tasks: [],
    }
  }

  const totalBatches = Math.ceil(
    sortedEvidenceCards.length / config.human_batch_size,
  )
  writeFileSync(
    path.join(runDirectory, 'human-review.md'),
    renderHumanReview(
      sortedEvidenceCards,
      1,
      config.human_batch_size,
      {
        target: startingState.target_path,
        ...(startingState.coverage ?? {}),
      },
    ),
  )
  const qualityFlags =
    sortedEvidenceCards.length > config.human_batch_size
      ? ['REVIEW_OVERLOAD']
      : []
  state = transition(runDirectory, state, 'AWAITING_HUMAN', {
    current_batch: 1,
    total_batches: totalBatches,
    quality_flags: qualityFlags,
  })
  return {
    status: state.status,
    run_dir: runDirectory,
    tasks: [],
    current_batch: state.current_batch,
    total_batches: state.total_batches,
  }
}

function createArchitectureShardTasks({
  runDirectory,
  shards,
  startIndex,
  config,
}) {
  return shards
    .slice(startIndex, startIndex + config.max_parallel_subagents)
    .map((shard) =>
      createNativeTask({
        runDirectory,
        stage: 'architecture_shard',
        attempt: 1,
        modelConfig: config.models.architecture,
        roleFileName: 'architecture-shard-role.md',
        schemaFileName: 'architecture-shard-result.schema.json',
        logicalId: shard.logical_id,
        timeoutMs: config.timeouts_ms.architecture,
        responseGraceMs: config.timeouts_ms.response_grace,
        input: shard.input,
      }),
    )
}

function proceedFromArchitectureCandidates({
  repositoryRoot,
  run,
  config,
  architectureCandidates,
}) {
  const l1Candidates = JSON.parse(
    readFileSync(path.join(run.runDirectory, 'l1-candidates.json'), 'utf8'),
  )
  const contractLedger = JSON.parse(
    readFileSync(path.join(run.runDirectory, 'contract-ledger.json'), 'utf8'),
  )
  const l1Layer = enforceCandidateLayer(
    l1Candidates.candidates,
    'self_consistency',
  )
  const l2Layer = enforceCandidateLayer(
    architectureCandidates,
    'architecture',
  )
  const prepared = prepareCandidates(
    [...l1Layer.accepted, ...l2Layer.accepted],
    run.manifest.documents,
    config.command_allowlist,
  )
  prepared.rejected.unshift(...l1Layer.rejected, ...l2Layer.rejected)
  writeJson(path.join(run.runDirectory, 'candidates.json'), prepared.accepted)
  writeJson(path.join(run.runDirectory, 'rejected.json'), prepared.rejected)
  writeJson(path.join(run.runDirectory, 'adversarial-results.json'), [])
  writeJson(path.join(run.runDirectory, 'evidence-cards.json'), [])
  const nextCandidates = prepared.accepted.slice(
    0,
    config.max_parallel_subagents,
  )
  const tasks = createAdversarialBatch({
    candidates: nextCandidates,
    runDirectory: run.runDirectory,
    manifest: run.manifest,
    contractLedger,
    config,
  })
  const taskAttempts = { ...run.state.task_attempts }
  for (const task of tasks) {
    taskAttempts[task.logical_id] = 1
  }
  const state = transition(
    run.runDirectory,
    run.state,
    'ARCHITECTURE_CHECKED',
    {
      active_tasks: tasks.map((task) => task.task_id),
      task_attempts: taskAttempts,
      next_adversarial_index: tasks.length,
    },
  )
  if (tasks.length === 0) {
    return finishReview({
      repositoryRoot,
      runDirectory: run.runDirectory,
      state,
      config,
      adversarialResults: [],
      rejected: prepared.rejected,
      evidenceCards: [],
    })
  }
  return {
    status: state.status,
    run_dir: run.runDirectory,
    tasks,
  }
}

function loadRun(repositoryRoot, requestedRunDirectory) {
  const runDirectory = canonicalDirectory(repositoryRoot, requestedRunDirectory)
  const reviewsRoot = path.join(
    repositoryRoot,
    '.superpowers',
    'design-reviews',
  )
  const relativeToReviews = path.relative(reviewsRoot, runDirectory)
  if (
    relativeToReviews.startsWith(`..${path.sep}`) ||
    relativeToReviews === '..' ||
    path.isAbsolute(relativeToReviews)
  ) {
    throw new Error('运行目录不属于 .superpowers/design-reviews')
  }
  const manifest = JSON.parse(
    readFileSync(path.join(runDirectory, 'manifest.json'), 'utf8'),
  )
  if (![3, 4, 5, 6, 7].includes(manifest.version)) {
    throw new Error(`不支持的 Manifest 版本：${manifest.version}`)
  }
  if (manifest.version === 6 && manifest.mode !== 'fix_verification') {
    throw new Error('Manifest 版本 6 仅支持 fix_verification 模式')
  }
  return {
    runDirectory,
    state: JSON.parse(
      readFileSync(path.join(runDirectory, 'state.json'), 'utf8'),
    ),
    manifest,
  }
}

function changedInput(manifest, repositoryRoot) {
  for (const document of manifest.documents) {
    const currentPath = path.join(repositoryRoot, document.path)
    if (!existsSync(currentPath)) {
      return `${document.path} 已不存在`
    }
    const currentContent = readFileSync(currentPath, 'utf8')
    if (sha256(currentContent) !== document.sha256) {
      return `${document.path} 摘要已变化`
    }
  }
  const currentConfigHash = sha256(readFileSync(configPath, 'utf8'))
  if (currentConfigHash !== manifest.config_sha256) {
    return 'review.config.json 摘要已变化'
  }
  return null
}

function decideReview(argumentsList) {
  const parsed = parseFileOption(
    argumentsList,
    '--decisions',
    '用法：review-design.mjs decide <run-directory> --decisions <decisions.json>',
  )
  const repositoryRoot = findRepositoryRoot(process.cwd())
  const run = loadRun(repositoryRoot, parsed.subject)
  if (run.state.status !== 'AWAITING_HUMAN') {
    throw new Error(`当前状态不接受人工决策：${run.state.status}`)
  }
  const inputChange = changedInput(run.manifest, repositoryRoot)
  if (inputChange) {
    const invalidated = transition(run.runDirectory, run.state, 'INVALIDATED', {
      invalidation_reason: inputChange,
    })
    return {
      status: invalidated.status,
      run_dir: run.runDirectory,
    }
  }

  const decisionsPath = canonicalPath(repositoryRoot, parsed.file).absolutePath
  const submitted = JSON.parse(readFileSync(decisionsPath, 'utf8'))
  if (!submitted || !Array.isArray(submitted.decisions)) {
    throw new Error('decisions.json 必须包含 decisions 数组')
  }
  const cards = JSON.parse(
    readFileSync(path.join(run.runDirectory, 'evidence-cards.json'), 'utf8'),
  )
  const config = JSON.parse(readFileSync(configPath, 'utf8'))
  const startIndex = (run.state.current_batch - 1) * config.human_batch_size
  const currentCards = cards.slice(
    startIndex,
    startIndex + config.human_batch_size,
  )
  const currentIds = new Set(currentCards.map((card) => card.finding_id))
  const submittedIds = new Set(
    submitted.decisions.map((decision) => decision.finding_id),
  )
  if (
    submitted.decisions.length !== submittedIds.size ||
    submittedIds.size !== currentIds.size ||
    [...currentIds].some((findingId) => !submittedIds.has(findingId))
  ) {
    throw new Error('人工决策必须且只能覆盖当前完整批次')
  }

  const existingDecisions = JSON.parse(
    readFileSync(path.join(run.runDirectory, 'decisions.json'), 'utf8'),
  )
  const rejected = JSON.parse(
    readFileSync(path.join(run.runDirectory, 'rejected.json'), 'utf8'),
  )
  const decidedAt = new Date().toISOString()
  const normalizedDecisions = submitted.decisions.map((decision) => {
    if (!currentIds.has(decision.finding_id)) {
      throw new Error(`决策不属于当前批次：${decision.finding_id}`)
    }
    if (decision.decision === 'accept') {
      if (
        decision.reason_code !== undefined ||
        decision.reason !== undefined
      ) {
        throw new Error('accept 决策不得包含 reason_code 或 reason')
      }
      return {
        finding_id: decision.finding_id,
        decision: 'accept',
        decided_at: decidedAt,
      }
    }
    if (decision.decision === 'reject') {
      if (
        typeof decision.reason !== 'string' ||
        decision.reason.trim().length === 0
      ) {
        throw new Error('reject 决策必须包含非空 reason')
      }
      const reason = decision.reason.trim()
      const rejection = {
        finding_id: decision.finding_id,
        decision_source: 'human',
        reason_code: decision.reason_code,
        details: reason,
      }
      assertSchema(rejection, 'rejection-record.schema.json', '人工拒绝记录')
      rejected.push(rejection)
      return {
        finding_id: decision.finding_id,
        decision: 'reject',
        reason_code: decision.reason_code,
        reason,
        decided_at: decidedAt,
      }
    }
    throw new Error(`未知人工决策：${decision.decision}`)
  })
  const allDecisions = [...existingDecisions, ...normalizedDecisions]
  writeJson(path.join(run.runDirectory, 'decisions.json'), allDecisions)
  writeJson(path.join(run.runDirectory, 'rejected.json'), rejected)

  if (run.state.current_batch < run.state.total_batches) {
    const nextBatch = run.state.current_batch + 1
    writeFileSync(
      path.join(run.runDirectory, 'human-review.md'),
      renderHumanReview(
        cards,
        nextBatch,
        config.human_batch_size,
        {
          target: run.state.target_path,
          ...(run.state.coverage ?? {}),
        },
      ),
    )
    const awaiting = transition(run.runDirectory, run.state, 'AWAITING_HUMAN', {
      current_batch: nextBatch,
    })
    return {
      status: awaiting.status,
      run_dir: run.runDirectory,
      current_batch: awaiting.current_batch,
      total_batches: awaiting.total_batches,
    }
  }

  const acceptedIds = new Set(
    allDecisions
      .filter((decision) => decision.decision === 'accept')
      .map((decision) => decision.finding_id),
  )
  const queue = cards
    .filter((card) => acceptedIds.has(card.finding_id))
    .map((card) => ({
      finding_id: card.finding_id,
      target_path: run.state.target_path,
      target_sha256: run.state.target_sha256,
      evidence_card: card,
    }))
  writeJson(path.join(run.runDirectory, 'fix-queue.json'), queue)
  const terminal = transition(
    run.runDirectory,
    run.state,
    queue.length > 0 ? 'QUEUED' : 'CLOSED',
    {
      current_batch: null,
    },
  )
  return {
    status: terminal.status,
    run_dir: run.runDirectory,
  }
}

function verifyQueue(argumentsList) {
  if (argumentsList.length !== 1) {
    throw new Error('用法：review-design.mjs verify-queue <run-directory>')
  }
  const repositoryRoot = findRepositoryRoot(process.cwd())
  const run = loadRun(repositoryRoot, argumentsList[0])
  if (run.state.status !== 'QUEUED') {
    throw new Error(`只有 QUEUED 运行可消费修复队列：${run.state.status}`)
  }
  const queue = JSON.parse(
    readFileSync(path.join(run.runDirectory, 'fix-queue.json'), 'utf8'),
  )
  for (const item of queue) {
    const currentTarget = canonicalPath(repositoryRoot, item.target_path)
    const currentHash = sha256(readFileSync(currentTarget.absolutePath, 'utf8'))
    if (currentHash !== item.target_sha256) {
      throw new Error(`目标文档摘要已变化：${item.target_path}`)
    }
  }
  return {
    status: 'VALID',
    run_dir: run.runDirectory,
    queue_items: queue.length,
  }
}

function main() {
  const [command, ...argumentsList] = process.argv.slice(2)
  if (command === 'prepare') {
    return prepareReview(argumentsList)
  }
  if (command === 'advance') {
    return advanceReview(argumentsList)
  }
  if (command === 'fail-task') {
    return failTask(argumentsList)
  }
  if (command === 'decide') {
    return decideReview(argumentsList)
  }
  if (command === 'verify-queue') {
    return verifyQueue(argumentsList)
  }
  if (command === 'verify-fixes') {
    return prepareFixVerification(argumentsList)
  }
  throw new Error(
    '支持的命令：prepare、advance、fail-task、decide、verify-queue、verify-fixes',
  )
}

try {
  const result = addHumanReadableResult(main())
  process.stdout.write(`${JSON.stringify(result)}\n`)
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}
