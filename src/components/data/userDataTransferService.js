import { Capacitor } from '@capacitor/core'
import {
  readAllConversationRecords,
  readConversationRecord,
  saveConversationRecord,
} from '../call/conversationDataService.js'
import { exportNativeRecordFile, pickNativeRecordFile } from '../photo-index/photoIndexService.js'

const EXPORT_APP = 'Snowlet'
const EXPORT_KIND = 'snowlet-user-records'
const EXPORT_VERSION = 1


const THINGS_BACKUP_DB = 'snowball-things-v1'
const THINGS_BACKUP_STORE = 'records'
const THINGS_BACKUP_KEY = 'things'

function openThingsBackupDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'))
      return
    }

    const request = indexedDB.open(THINGS_BACKUP_DB, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(THINGS_BACKUP_STORE)) {
        db.createObjectStore(THINGS_BACKUP_STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('物馆备份数据库无法打开'))
  })
}

async function saveImportedThingsBackup(things, savedAt) {
  const db = await openThingsBackupDb()

  return new Promise((resolve, reject) => {
    const tx = db.transaction(THINGS_BACKUP_STORE, 'readwrite')
    tx.objectStore(THINGS_BACKUP_STORE).put(
      {
        savedAt: Number(savedAt || Date.now()),
        things: Array.isArray(things) ? things : [],
      },
      THINGS_BACKUP_KEY,
    )
    tx.oncomplete = () => {
      db.close()
      resolve(true)
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error || new Error('物馆导入记录无法同步到本机备份'))
    }
  })
}


function cleanText(value) {
  return String(value ?? '').trim()
}

function cleanStringArray(value) {
  return Array.isArray(value)
    ? value.map(item => cleanText(item)).filter(Boolean)
    : []
}

function uniqueStrings(values = []) {
  return [...new Set(cleanStringArray(values))]
}

function normalizeDateKey(value) {
  const text = cleanText(value).replace(/-/g, '/')
  const match = text.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/)
  if (!match) return text
  return `${match[1]}/${Number(match[2])}/${Number(match[3])}`
}

function userConversationRecord(record = {}) {
  const date = normalizeDateKey(record.dateKey || record.date)
  return {
    date,
    food: cleanText(record.foodDescription ?? record.food),
    mood: cleanText(record.moodDescription ?? record.mood),
  }
}

function userFootprint(item = {}) {
  return {
    id: item.id ?? null,
    year: cleanText(item.year),
    month: cleanText(item.month),
    type: cleanText(item.type),
    place: cleanText(item.place),
    detail: cleanText(item.detail),
    note: cleanText(item.note),
  }
}

function userThing(item = {}) {
  return {
    id: item.id ?? null,
    type: cleanText(item.type),
    year: cleanText(item.year),
    month: cleanText(item.month),
    name: cleanText(item.name),
    reason: cleanText(item.reason),
    valueType: cleanText(item.valueType),
    value: cleanText(item.value),
  }
}

function userPerson(item = {}) {
  return {
    id: item.id ?? null,
    name: cleanText(item.name),
    nickname: cleanText(item.nickname),
    group: cleanText(item.group),
    relation: cleanText(item.relation),
    gender: cleanText(item.gender),
    startYear: cleanText(item.startYear),
    startMonth: cleanText(item.startMonth),
    endYear: cleanText(item.endYear),
    endMonth: cleanText(item.endMonth),
    frequency: cleanText(item.frequency),
    keywords: uniqueStrings(
      Array.isArray(item.keywords)
        ? item.keywords
        : cleanText(item.keyword).split(/[、,，\s]+/),
    ),
    impressionDepth:
      item.impressionDepth === '' || item.impressionDepth === null || item.impressionDepth === undefined
        ? ''
        : String(item.impressionDepth),
    note: cleanText(item.note),
  }
}

function withoutEmptyConversation(record) {
  return Boolean(record.date && (record.food || record.mood))
}

function stableSignature(value) {
  const source = JSON.stringify(value, Object.keys(value).sort())
  let hash = 2166136261
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function footprintSignature(item) {
  return stableSignature({
    year: cleanText(item.year),
    month: cleanText(item.month),
    type: cleanText(item.type),
    place: cleanText(item.place),
    detail: cleanText(item.detail),
    note: cleanText(item.note),
  })
}

function thingSignature(item) {
  return stableSignature({
    type: cleanText(item.type),
    year: cleanText(item.year),
    month: cleanText(item.month),
    name: cleanText(item.name),
    reason: cleanText(item.reason),
    valueType: cleanText(item.valueType),
    value: cleanText(item.value),
  })
}

function personSignature(item) {
  return stableSignature({
    name: cleanText(item.name),
    nickname: cleanText(item.nickname),
    group: cleanText(item.group),
    relation: cleanText(item.relation),
    gender: cleanText(item.gender),
    startYear: cleanText(item.startYear),
    startMonth: cleanText(item.startMonth),
    endYear: cleanText(item.endYear),
    endMonth: cleanText(item.endMonth),
    frequency: cleanText(item.frequency),
    keywords: uniqueStrings(item.keywords),
    impressionDepth:
      item.impressionDepth === '' || item.impressionDepth === null || item.impressionDepth === undefined
        ? ''
        : String(item.impressionDepth),
    note: cleanText(item.note),
  })
}

function mergeTextLines(current, incoming) {
  const before = cleanText(current)
  const next = cleanText(incoming)
  if (!before) return next
  if (!next) return before
  if (before === next) return before

  const lines = uniqueStrings([
    ...before.split(/\r?\n/),
    ...next.split(/\r?\n/),
  ])
  return lines.join('\n')
}

function createDownloadName() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `雪粒记录_${y}-${m}-${d}.json`
}

async function saveJsonFile(payload) {
  const text = JSON.stringify(payload, null, 2)
  const fileName = createDownloadName()

  if (Capacitor.isNativePlatform()) {
    const result = await exportNativeRecordFile(text, fileName)
    return {
      fileName,
      method: result?.cancelled ? 'cancelled' : 'native',
    }
  }

  const blob = new Blob([text], { type: 'application/json;charset=utf-8' })

  try {
    const file = new File([blob], fileName, { type: blob.type })
    if (
      typeof navigator !== 'undefined'
      && typeof navigator.share === 'function'
      && (!navigator.canShare || navigator.canShare({ files: [file] }))
    ) {
      await navigator.share({
        files: [file],
        title: '雪粒记录',
      })
      return { fileName, method: 'share' }
    }
  } catch (error) {
    if (error?.name === 'AbortError') return { fileName, method: 'cancelled' }
    // 网页分享不可用时继续走浏览器下载。
  }

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  return { fileName, method: 'download' }
}

async function chooseJsonFile() {
  // iPhone 安装版继续走上一轮新增的原生 UIDocumentPicker。
  // Android / 华为仍保持原来的网页文件选择路径，不改变已验证行为。
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios') {
    const result = await pickNativeRecordFile()
    if (!result || result.cancelled) return null

    return {
      file: null,
      fileName: String(result.fileName || ''),
      text: String(result.content || ''),
    }
  }

  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'

    Object.assign(input.style, {
      position: 'fixed',
      right: '0',
      bottom: '0',
      width: '1px',
      height: '1px',
      opacity: '0',
      pointerEvents: 'none',
      zIndex: '-1',
    })

    let settled = false
    let readTimer = null
    let pickerTimer = null

    const cleanup = () => {
      if (readTimer) {
        window.clearTimeout(readTimer)
        readTimer = null
      }
      if (pickerTimer) {
        window.clearTimeout(pickerTimer)
        pickerTimer = null
      }
      input.remove()
    }

    const finishResolve = value => {
      if (settled) return
      settled = true
      cleanup()
      resolve(value)
    }

    const finishReject = error => {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    }

    const readSelectedFile = file => {
      if (!file || settled) return

      const reader = new FileReader()

      readTimer = window.setTimeout(() => {
        try { reader.abort() } catch {}
        finishReject(new Error('记录文件读取超时，请重新选择文件。'))
      }, 15000)

      reader.onload = () => {
        const content = String(reader.result || '')
        if (!content.trim()) {
          finishReject(new Error('记录文件内容为空，请重新选择雪粒导出的 JSON 文件。'))
          return
        }

        finishResolve({
          file,
          fileName: String(file.name || ''),
          text: content,
        })
      }

      reader.onerror = () => {
        finishReject(reader.error || new Error('记录文件无法读取。'))
      }

      reader.onabort = () => {
        if (!settled) finishReject(new Error('记录文件读取已中止。'))
      }

      try {
        reader.readAsText(file, 'utf-8')
      } catch (error) {
        finishReject(error)
      }
    }

    input.addEventListener('change', () => {
      const file = input.files?.[0]
      if (!file) {
        finishResolve(null)
        return
      }
      readSelectedFile(file)
    })

    // Safari / 新版浏览器支持 file input 的 cancel 事件时，明确处理用户取消。
    // 不再使用 window.focus 判断取消：iPhone Safari 返回页面时 focus
    // 可能早于 change/input.files 更新，旧逻辑会把真正选中的文件误判成“取消”。
    input.addEventListener('cancel', () => {
      finishResolve(null)
    })

    document.body.appendChild(input)

    // 只作为兜底：某些旧浏览器既不发 change 也不发 cancel 时，
    // 不让 Promise 永久悬挂。正常选择文件不会等到这里。
    pickerTimer = window.setTimeout(() => {
      if (!settled) {
        const file = input.files?.[0]
        if (file) readSelectedFile(file)
        else finishResolve(null)
      }
    }, 120000)

    try {
      input.click()
    } catch (error) {
      finishReject(error)
    }
  })
}

function validatePayload(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('记录文件格式不正确。')
  if (payload.app !== EXPORT_APP || payload.kind !== EXPORT_KIND) {
    throw new Error('这不是雪粒导出的记录文件。')
  }
  if (Number(payload.version) !== EXPORT_VERSION) {
    throw new Error('记录文件版本暂不支持。')
  }
  if (!payload.records || typeof payload.records !== 'object') {
    throw new Error('记录文件缺少数据内容。')
  }
}

function nextUniqueId(existingIds, preferredId, prefix) {
  if (preferredId !== null && preferredId !== undefined && preferredId !== '') {
    const key = String(preferredId)
    if (!existingIds.has(key)) {
      existingIds.add(key)
      return preferredId
    }
  }

  let candidate = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  while (existingIds.has(String(candidate))) {
    candidate = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }
  existingIds.add(String(candidate))
  return candidate
}

function mergeList(existing = [], incoming = [], sanitize, signature, prefix) {
  const current = Array.isArray(existing) ? existing : []
  const additions = Array.isArray(incoming) ? incoming : []
  const result = [...current]
  const signatures = new Set(current.map(item => signature(sanitize(item))))
  const existingIds = new Set(current.map(item => String(item?.id ?? '')).filter(Boolean))
  let added = 0
  let skipped = 0

  additions.forEach(raw => {
    const clean = sanitize(raw)
    const sig = signature(clean)

    if (signatures.has(sig)) {
      skipped += 1
      return
    }

    const id = nextUniqueId(existingIds, clean.id, prefix)
    result.push({ ...clean, id, photos: [] })
    signatures.add(sig)
    added += 1
  })

  return { result, added, skipped }
}

export async function exportSnowletUserRecords(data = {}) {
  const conversations = (await readAllConversationRecords())
    .map(userConversationRecord)
    .filter(withoutEmptyConversation)

  const payload = {
    app: EXPORT_APP,
    kind: EXPORT_KIND,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    note: '仅包含用户输入的文字记录，不包含照片、步数、屏幕时间及雪粒计算结果。',
    records: {
      daily: conversations,
      footprints: (data.footprints || []).map(userFootprint),
      things: (data.things || []).map(userThing),
      people: (data.people || []).map(userPerson),
    },
  }

  const saved = await saveJsonFile(payload)
  return {
    ...saved,
    counts: {
      daily: payload.records.daily.length,
      footprints: payload.records.footprints.length,
      things: payload.records.things.length,
      people: payload.records.people.length,
    },
  }
}

export async function importSnowletUserRecords(data = {}) {
  const selected = await chooseJsonFile()
  if (!selected) return { cancelled: true }

  let payload
  try {
    payload = JSON.parse(selected.text)
  } catch (error) {
    throw new Error('记录文件无法读取，请确认选择的是雪粒导出的 JSON 文件。')
  }

  validatePayload(payload)

  const daily = Array.isArray(payload.records.daily) ? payload.records.daily : []
  let dailyAdded = 0
  let dailyMerged = 0
  let dailySkipped = 0
  const importedDailyDateSet = new Set()

  for (const raw of daily) {
    const incoming = userConversationRecord(raw)
    if (!incoming.date || (!incoming.food && !incoming.mood)) {
      dailySkipped += 1
      continue
    }

    // 只要备份中这一天存在有效的饮食/心情原始记录，就交给 App 在导入后
    // 用当前版本的识别词表重新计算日常表。即使原始文字与本机完全重复，也要重算，
    // 这样修改主数据后重新导入同一份备份，也能刷新派生关键词。
    importedDailyDateSet.add(incoming.date)

    const current = await readConversationRecord(incoming.date)
    const nextFood = mergeTextLines(current.foodDescription, incoming.food)
    const nextMood = mergeTextLines(current.moodDescription, incoming.mood)

    const hadAny = Boolean(cleanText(current.foodDescription) || cleanText(current.moodDescription))
    const changed =
      nextFood !== cleanText(current.foodDescription)
      || nextMood !== cleanText(current.moodDescription)

    if (!changed) {
      dailySkipped += 1
      continue
    }

    await saveConversationRecord({
      ...current,
      foodDescription: nextFood,
      moodDescription: nextMood,
    })

    if (hadAny) dailyMerged += 1
    else dailyAdded += 1
  }

  const footprints = mergeList(
    data.footprints,
    payload.records.footprints,
    userFootprint,
    footprintSignature,
    'footprint',
  )

  const things = mergeList(
    data.things,
    payload.records.things,
    userThing,
    thingSignature,
    'thing',
  )

  const people = mergeList(
    data.people,
    payload.records.people,
    userPerson,
    personSignature,
    'person',
  )

  const now = Date.now()

  // 物馆还有自己独立的 IndexedDB 备份。
  // 导入后同步刷新它，避免进入物馆时旧备份把新导入记录覆盖回去。
  if (things.added > 0) {
    await saveImportedThingsBackup(things.result, now)
  }

  const nextData = {
    ...data,
    footprints: footprints.result,
    things: things.result,
    people: people.result,
    thingsSavedAt: now,
    lastSavedAt: now,
  }

  return {
    cancelled: false,
    nextData,
    importedDailyDates: [...importedDailyDateSet],
    summary: {
      dailyAdded,
      dailyMerged,
      dailySkipped,
      footprintsAdded: footprints.added,
      footprintsSkipped: footprints.skipped,
      thingsAdded: things.added,
      thingsSkipped: things.skipped,
      peopleAdded: people.added,
      peopleSkipped: people.skipped,
    },
  }
}
