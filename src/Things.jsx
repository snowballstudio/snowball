import { useEffect, useMemo, useRef, useState } from 'react'
import './Things.css'
import {
  isPhotoIndexAvailable,
  pickPhotoIndexes,
  presentIndexedPhoto,
} from './components/photo-index/photoIndexService.js'

const THING_TYPES = { wish: '愿单', treasure: '在手', memory: '舍离' }
const THING_COPY = {
  wish: { title: '我的愿单', placeholder: '性能、意义等，添加后点储物箱看展示。' },
  treasure: { title: '此刻拥有', placeholder: '性能、意义等，添加后点储物箱看展示。。' },
  memory: { title: '舍离区', placeholder: '性能、意义等，添加后点储物箱看展示。。' },
}
const PAW_STEP = 20
const THING_CAT_IMAGES = { overview: '/refine/things_general_cat.png' }
const EMPTY_THING_DRAFT = { type: 'wish', year: '', month: '', name: '', reason: '', photos: [], valueType: 'priceless', value: '' }
const THING_GEM_LIMIT = 18
const THING_GEM_LEGEND = [
  { src: '/refine/things_wish_withvalue.png', label: '愿单 · 有价' },
  { src: '/refine/things_wish_valueless.png', label: '愿单 · 无价' },
  { src: '/refine/things_own_valueless.png', label: '在手 · 无价' },
  { src: '/refine/things_own_1-10.png', label: '在手 · 1 ~ 10金粒' },
  { src: '/refine/things_own_10-100.png', label: '在手 · 10 ~ 100金粒' },
  { src: '/refine/things_own_100-1000.png', label: '在手 · 100 ~ 1000金粒' },
  { src: '/refine/things_own_1000-5000.png', label: '在手 · 1000 ~ 5000金粒' },
  { src: '/refine/things_own_over5000.png', label: '在手 · 5000金粒以上' },
  { src: '/refine/things_archive_valueless.png', label: '舍离 · 无价' },
  { src: '/refine/things_archive_withvalue.png', label: '舍离 · 有价' },
]
const THING_STATUS_ORDER = { treasure: 0, wish: 1, memory: 2 }

const THINGS_BACKUP_DB = 'snowball-things-v1'
const THINGS_BACKUP_STORE = 'records'
const THINGS_BACKUP_KEY = 'things'

const THING_NAME_MAX_UNITS = 20
const THING_REASON_MIN_UNITS = 8

function thingTextUnits(value) {
  return Array.from(String(value || '')).reduce(
    (sum, char) => sum + (/[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/u.test(char) ? 2 : 1),
    0,
  )
}

function limitThingText(value, maxUnits) {
  let result = ''
  let units = 0

  for (const char of Array.from(String(value || ''))) {
    const charUnits = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/u.test(char) ? 2 : 1
    if (units + charUnits > maxUnits) break
    result += char
    units += charUnits
  }

  return result
}

function openThingsBackupDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'))
      return
    }
    const request = indexedDB.open(THINGS_BACKUP_DB, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(THINGS_BACKUP_STORE)) db.createObjectStore(THINGS_BACKUP_STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('IndexedDB open failed'))
  })
}

function loadThingsBackup() {
  return openThingsBackupDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(THINGS_BACKUP_STORE, 'readonly')
    const request = tx.objectStore(THINGS_BACKUP_STORE).get(THINGS_BACKUP_KEY)
    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => reject(request.error || new Error('IndexedDB read failed'))
    tx.oncomplete = () => db.close()
  }))
}

function saveThingsBackup(things, savedAt = Date.now()) {
  return openThingsBackupDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(THINGS_BACKUP_STORE, 'readwrite')
    tx.objectStore(THINGS_BACKUP_STORE).put({ savedAt: Number(savedAt || Date.now()), things }, THINGS_BACKUP_KEY)
    tx.oncomplete = () => { db.close(); resolve(true) }
    tx.onerror = () => { db.close(); reject(tx.error || new Error('IndexedDB write failed')) }
  }))
}


function thingGoldAmount(itemOrValue) {
  const value = typeof itemOrValue === 'object' && itemOrValue !== null ? itemOrValue.value : itemOrValue
  const text = String(value || '').trim()
  return text ? Number(text.replace(/[^0-9.]/g, '')) || 0 : 0
}
function thingIsPriceless(itemOrValue, valueType) {
  if (typeof itemOrValue === 'object' && itemOrValue !== null) {
    if (itemOrValue.valueType === 'priceless') return true
    if (itemOrValue.valueType === 'gold') return false
    const text = String(itemOrValue.value || '').trim()
    return !text || text.includes('无价')
  }
  const text = String(itemOrValue || '').trim()
  return valueType === 'priceless' || !text || text.includes('无价')
}
function thingValueLabel(itemOrValue, valueType) {
  if (thingIsPriceless(itemOrValue, valueType)) return '无价'
  const n = thingGoldAmount(itemOrValue)
  return n ? `${n}金粒` : '无价'
}

function thingGemSrc(item) {
  const type = item?.type || 'wish'
  const priceless = thingIsPriceless(item)

  if (type === 'wish') {
    return priceless
      ? '/refine/things_wish_valueless.png'
      : '/refine/things_wish_withvalue.png'
  }

  if (type === 'memory') {
    return priceless
      ? '/refine/things_archive_valueless.png'
      : '/refine/things_archive_withvalue.png'
  }

  if (priceless) return '/refine/things_own_valueless.png'

  const amount = thingGoldAmount(item)
  if (amount < 10) return '/refine/things_own_1-10.png'
  if (amount < 100) return '/refine/things_own_10-100.png'
  if (amount < 1000) return '/refine/things_own_100-1000.png'
  if (amount < 5000) return '/refine/things_own_1000-5000.png'
  return '/refine/things_own_over5000.png'
}

function thingStartKey(item) { return Number(item?.year || 0) * 100 + Number(item?.month || 0) }
function thingStartLabel(item) {
  const year = String(item?.year || '').trim()
  const monthNumber = Number(item?.month || 0)
  const month = monthNumber > 0 ? String(monthNumber).padStart(2, '0') : '00'
  return `${year}.${month}`
}
function thingPawLayers(item) {
  const viewCount = Number(item?.pawCount || 0)
  if (viewCount <= 0) return []
  const markCount = Math.floor((viewCount - 1) / PAW_STEP) + 1
  return Array.from({ length: Math.min(10, markCount) }, (_, index) => {
    const toneLevel = Math.min(2, Math.floor((markCount - 1 - index) / 10))
    return { tone: toneLevel === 0 ? 'light' : toneLevel === 1 ? 'dark' : 'black' }
  })
}
function ThingPaws({ item, className = '', compact = false }) {
  const layers = thingPawLayers(item)
  if (!layers.length) return null
  if (compact) {
    const strongest = layers.reduce((best, layer) => ({ light: 0, dark: 1, black: 2 }[layer.tone] > { light: 0, dark: 1, black: 2 }[best] ? layer.tone : best), 'light')
    return <span className={`thingPaws thingPawsCompact ${className}`} aria-label={`雪粒爪印${layers.length}枚`}><span className={`catPawStack catPawStackCompact pawTone-${strongest}`}><img src="/refine/cat_paw.png" alt="" aria-hidden="true" /></span></span>
  }
  return <span className={`thingPaws ${className}`} aria-label={`雪粒爪印${layers.length}枚`}>{layers.map((layer, index) => <span className={`catPawStack pawTone-${layer.tone}`} key={index}><img src="/refine/cat_paw.png" alt="" aria-hidden="true" /></span>)}</span>
}

export default function Things({ data, setData, onClose, initialMode = 'overview' }) {
  const [thingsMode, setThingsMode] = useState(initialMode || 'overview')
  const [selectedThingId, setSelectedThingId] = useState(null)
  const [editingThingId, setEditingThingId] = useState(null)
  const [thingModal, setThingModal] = useState(null)
  const [pendingThingMove, setPendingThingMove] = useState(null)
  const [pendingThingDelete, setPendingThingDelete] = useState(null)
  const [thingsSort, setThingsSort] = useState({ key: 'start', direction: 'desc' })
  const [showThingsInfo, setShowThingsInfo] = useState(false)
  const [showGemGallery, setShowGemGallery] = useState(false)
  const [thingsBackupReady, setThingsBackupReady] = useState(false)
  const initialThingsSavedAtRef = useRef(Number(data.thingsSavedAt || 0))
  const thingsCrateRef = useRef(null)
  const thingsCrateTargetRef = useRef(null)
  const gemFlyTimerRef = useRef(null)
  const [flyingGem, setFlyingGem] = useState(null)
  const [gemPositions, setGemPositions] = useState(() => data.thingGemPositions || {})
  const [gemOrderMode, setGemOrderMode] = useState(() => data.thingGemOrderMode === 'type' ? 'type' : 'chronological')
  const [isGemArrangeMode, setIsGemArrangeMode] = useState(false)
  const [gemDetailId, setGemDetailId] = useState(null)
  const gemDragRef = useRef(null)

  // 当前物馆数据必须在依赖它的 effect 之前初始化。
  // 否则依赖数组读取 things.length 时会触发 const 的暂时性死区（TDZ），导致物馆渲染直接黑屏。
  const things = data.things || []
  const thingDraft = data.thingDraft || EMPTY_THING_DRAFT

  useEffect(() => {
    let alive = true
    loadThingsBackup()
      .then(backup => {
        if (!alive) return
        const backupThings = Array.isArray(backup?.things) ? backup.things : null
        const backupSavedAt = Number(backup?.savedAt || 0)
        const localThings = Array.isArray(data.things) ? data.things : []
        const localSavedAt = Number(initialThingsSavedAtRef.current || 0)
        const backupHasMore = Boolean(backupThings && backupThings.length > localThings.length)
        const backupIsNewer = Boolean(backupThings && backupSavedAt > localSavedAt)
        const backupHasPhotos = Boolean(backupThings?.some(item => Array.isArray(item?.photos) && item.photos.length))
        const localHasPhotos = Boolean(localThings.some(item => Array.isArray(item?.photos) && item.photos.length))

        // 物馆使用自己的时间戳，不再受日常、人间等模块的全局 lastSavedAt 干扰。
        // localStorage 会主动去掉照片，因此同数量时也优先恢复包含照片的 IndexedDB 版本。
        if (backupThings && (backupHasMore || backupIsNewer || (backupHasPhotos && !localHasPhotos))) {
          setData(prev => ({
            ...prev,
            things: backupThings,
            thingsSavedAt: backupSavedAt || Date.now(),
            lastSavedAt: Math.max(Number(prev.lastSavedAt || 0), backupSavedAt || Date.now()),
          }))
        }
      })
      .catch(error => console.warn('物馆备份读取失败。', error))
      .finally(() => { if (alive) setThingsBackupReady(true) })
    return () => { alive = false }
  }, [setData])

  useEffect(() => {
    if (!thingsBackupReady) return
    const things = Array.isArray(data.things) ? data.things : []
    const savedAt = Number(data.thingsSavedAt || Date.now())
    saveThingsBackup(things, savedAt)
      .catch(error => console.warn('物馆备份保存失败。', error))
  }, [thingsBackupReady, data.things, data.thingsSavedAt])

  useEffect(() => {
    if (thingsMode !== 'overview' || !thingsCrateRef.current) return
    const rect = thingsCrateRef.current.getBoundingClientRect()
    thingsCrateTargetRef.current = {
      x: rect.left + rect.width * 0.5,
      y: rect.top + rect.height * 0.58,
    }
  }, [thingsMode, things.length])

  useEffect(() => () => {
    if (gemFlyTimerRef.current) window.clearTimeout(gemFlyTimerRef.current)
  }, [])
  const nameComposingRef = useRef(false)
  const [showAddForm, setShowAddForm] = useState(false)

  const currentThingList = things.filter(item => item.type === thingsMode)
  const selectedThing = things.find(item => item.id === selectedThingId) || (!showAddForm ? currentThingList[0] : null)
  const thingTotals = useMemo(() => {
    const base = { wish: { gold: 0, priceless: 0 }, treasure: { gold: 0, priceless: 0 }, memory: { gold: 0, priceless: 0 }, all: { gold: 0, priceless: 0 } }
    things.forEach(item => {
      if (thingIsPriceless(item)) { base[item.type].priceless += 1; base.all.priceless += 1 }
      else { const n = thingGoldAmount(item); base[item.type].gold += n; base.all.gold += n }
    })
    return base
  }, [things])
  const visibleThingGems = useMemo(
    () => [...things]
      .sort((a, b) => Number(a?.createdAt || a?.id || 0) - Number(b?.createdAt || b?.id || 0))
      .slice(0, THING_GEM_LIMIT),
    [things],
  )
  const displayedGemThings = useMemo(() => {
    const list = [...things]
    if (gemOrderMode === 'type') {
      const typeOrder = { wish: 0, treasure: 1, memory: 2 }
      list.sort((a, b) => {
        const typeDiff = (typeOrder[a?.type] ?? 99) - (typeOrder[b?.type] ?? 99)
        if (typeDiff) return typeDiff
        return Number(a?.createdAt || a?.id || 0) - Number(b?.createdAt || b?.id || 0)
      })
      return list
    }
    return list.sort((a, b) => Number(a?.createdAt || a?.id || 0) - Number(b?.createdAt || b?.id || 0))
  }, [things, gemOrderMode])
  const gemDetailItem = things.find(item => item.id === gemDetailId) || null
  const hasManualGemLayout = Object.values(gemPositions || {}).some(pos => Math.abs(Number(pos?.x || 0)) > 0.5 || Math.abs(Number(pos?.y || 0)) > 0.5)

  const sortedThings = useMemo(() => {
    const list = [...things]
    const direction = thingsSort.direction === 'asc' ? 1 : -1
    list.sort((a, b) => {
      if (thingsSort.key === 'name') return String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN') * direction
      if (thingsSort.key === 'start') return (thingStartKey(a) - thingStartKey(b)) * direction
      if (thingsSort.key === 'status') return ((THING_STATUS_ORDER[a.type] ?? 99) - (THING_STATUS_ORDER[b.type] ?? 99)) * direction
      if (thingsSort.key === 'value') {
        const ap = thingIsPriceless(a), bp = thingIsPriceless(b)
        if (ap !== bp) return ap ? -1 : 1
        return (thingGoldAmount(a) - thingGoldAmount(b)) * direction
      }
      return 0
    })
    return list
  }, [things, thingsSort])
  const thingPanelTitle = showGemGallery ? '储物箱' : (showThingsInfo ? '物馆说明' : (thingsMode === 'overview' ? '物品档案' : THING_COPY[thingsMode]?.title || '物品档案'))

  function updateThingDraft(field, value) { setData(prev => ({ ...prev, thingDraft: { ...(prev.thingDraft || EMPTY_THING_DRAFT), [field]: value }, lastSavedAt: Date.now() })) }
  function openAddThing() {
    const type = thingsMode === 'overview' ? 'wish' : thingsMode
    setEditingThingId(null)
    setSelectedThingId(null)
    setData(prev => ({ ...prev, thingDraft: { ...EMPTY_THING_DRAFT, type }, lastSavedAt: Date.now() }))
    setShowAddForm(true)
  }
  function closeThingForm() {
    const type = thingsMode === 'overview' ? 'wish' : thingsMode
    setShowAddForm(false)
    setEditingThingId(null)
    setData(prev => ({ ...prev, thingDraft: { ...EMPTY_THING_DRAFT, type }, lastSavedAt: Date.now() }))
  }
  function openThings(type = 'overview') {
    setThingsMode(type); setSelectedThingId(null); setEditingThingId(null); setShowAddForm(false)
    if (type !== 'overview') setData(prev => ({ ...prev, thingDraft: { ...EMPTY_THING_DRAFT, type }, lastSavedAt: Date.now() }))
  }
  function goBack() {
    if (showGemGallery) { setShowGemGallery(false); return }
    if (showThingsInfo) { setShowThingsInfo(false); return }
    if (thingsMode === 'overview') onClose(); else openThings('overview')
  }
  function thingTypeVerb(type) { return type === 'wish' ? '期待' : type === 'treasure' ? '拥有' : '记住' }
  function showThingMessage(title, text) { setThingModal({ title, text }) }
  function reasonStrongEnough(reason) {
    const text = String(reason || '')
    const clean = text.replace(/\s/g, '')
    if (!clean || thingTextUnits(text) < THING_REASON_MIN_UNITS) return false
    return !(thingTextUnits(text) < 14 && ['喜欢', '好看', '想要', '不错', '随便', '不知道'].some(word => clean.includes(word)))
  }
  function selectThing(id) {
    setSelectedThingId(id)
    setData(prev => ({ ...prev, things: (prev.things || []).map(item => item.id === id ? { ...item, pawCount: Number(item.pawCount || 0) + 1, lastViewedAt: Date.now() } : item), thingsSavedAt: Date.now(), lastSavedAt: Date.now() }))
  }
  function launchThingGem(item, event) {
    if (!item) return
    const buttonRect = event?.currentTarget?.getBoundingClientRect?.()
    const startX = buttonRect ? buttonRect.left + buttonRect.width * 0.5 : window.innerWidth * 0.5
    const startY = buttonRect ? buttonRect.top + buttonRect.height * 0.5 : window.innerHeight * 0.72
    const fallbackTarget = {
      x: Math.max(68, Math.min(150, window.innerWidth * 0.16)),
      y: Math.max(118, Math.min(175, window.innerHeight * 0.20)),
    }
    const target = thingsCrateTargetRef.current || fallbackTarget
    const dx = target.x - startX
    const dy = target.y - startY

    if (gemFlyTimerRef.current) window.clearTimeout(gemFlyTimerRef.current)
    setFlyingGem({
      id: `${item.id}-${Date.now()}`,
      src: thingGemSrc(item),
      startX,
      startY,
      midX: dx * 0.54,
      midY: dy * 0.48 - Math.min(190, Math.max(120, Math.abs(dx) * 0.28)),
      endX: dx,
      endY: dy,
    })
    gemFlyTimerRef.current = window.setTimeout(() => setFlyingGem(null), 1180)
  }

  function openGemDetail(item) {
    if (!item || isGemArrangeMode) return
    setGemDetailId(item.id)
  }

  function toggleGemArrangeMode() {
    setGemDetailId(null)
    if (isGemArrangeMode) {
      setData(prev => ({
        ...prev,
        thingGemPositions: { ...gemPositions },
        thingGemOrderMode: gemOrderMode,
        lastSavedAt: Date.now(),
      }))
      setIsGemArrangeMode(false)
      return
    }
    setGemPositions({ ...(data.thingGemPositions || {}) })
    setIsGemArrangeMode(true)
  }

  function resetOrSortGems() {
    setGemDetailId(null)
    gemDragRef.current = null

    // 只要当前有手动排版（包括正在排版），第一次点击都清空排版，
    // 恢复为最初的“按记录先后”顺序；再次点击才切换为“按类型”排序。
    if (isGemArrangeMode || hasManualGemLayout) {
      setIsGemArrangeMode(false)
      setGemPositions({})
      setGemOrderMode('chronological')
      setData(prev => ({
        ...prev,
        thingGemPositions: {},
        thingGemOrderMode: 'chronological',
        lastSavedAt: Date.now(),
      }))
      return
    }

    const nextMode = gemOrderMode === 'chronological' ? 'type' : 'chronological'
    setGemPositions({})
    setGemOrderMode(nextMode)
    setData(prev => ({
      ...prev,
      thingGemPositions: {},
      thingGemOrderMode: nextMode,
      lastSavedAt: Date.now(),
    }))
  }

  function startGemDrag(event, item) {
    if (!isGemArrangeMode || !item) return
    const current = gemPositions[item.id] || { x: 0, y: 0 }
    const buttonRect = event.currentTarget.getBoundingClientRect()
    const gridRect = event.currentTarget.closest('.thingsGemShowcaseGrid')?.getBoundingClientRect()
    gemDragRef.current = {
      id: item.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: Number(current.x || 0),
      originY: Number(current.y || 0),
      minX: gridRect ? gridRect.left - buttonRect.left + Number(current.x || 0) : -9999,
      maxX: gridRect ? gridRect.right - buttonRect.right + Number(current.x || 0) : 9999,
      minY: gridRect ? gridRect.top - buttonRect.top + Number(current.y || 0) : -9999,
      maxY: gridRect ? gridRect.bottom - buttonRect.bottom + Number(current.y || 0) : 9999,
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  function moveGemDrag(event) {
    const drag = gemDragRef.current
    if (!isGemArrangeMode || !drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    const rawX = drag.originX + event.clientX - drag.startX
    const rawY = drag.originY + event.clientY - drag.startY
    const next = {
      x: Math.max(drag.minX, Math.min(drag.maxX, rawX)),
      y: Math.max(drag.minY, Math.min(drag.maxY, rawY)),
    }
    setGemPositions(prev => ({ ...prev, [drag.id]: next }))
  }

  function endGemDrag(event) {
    const drag = gemDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    gemDragRef.current = null
  }

  function saveThing(event) {
    const draft = data.thingDraft || EMPTY_THING_DRAFT
    const type = draft.type || thingsMode || 'wish'
    const year = String(draft.year || '').trim(), month = String(draft.month || '').trim(), name = String(draft.name || '').trim(), reason = String(draft.reason || '').trim()
    const valueType = draft.valueType || 'priceless', value = valueType === 'gold' ? String(draft.value || '').trim() : ''
    if (!year || !month || !name || !reason || (valueType === 'gold' && !value)) return
    if (thingTextUnits(name) > THING_NAME_MAX_UNITS) {
      showThingMessage('物名太长', '物名最多填写10个汉字，或20个字母（含空格）。')
      return
    }
    if (!reasonStrongEnough(reason)) { showThingMessage(`描述至少需要4个汉字，或8个字母（含空格）。再写清楚一点：为什么它值得${thingTypeVerb(type)}？`); return }
    const line = `雪粒理解了，此物值得${thingTypeVerb(type)}。`
    if (editingThingId) {
      const savedId = editingThingId
      setData(prev => ({ ...prev, things: (prev.things || []).map(item => item.id === savedId ? { ...item, type, year, month, name, reason, valueType, value, photos: Array.isArray(draft.photos) ? draft.photos : [], pawText: line, updatedAt: Date.now() } : item), thingDraft: { ...EMPTY_THING_DRAFT, type }, thingsSavedAt: Date.now(), lastSavedAt: Date.now() }))
      setEditingThingId(null); setSelectedThingId(savedId); setThingsMode(type); setShowAddForm(false); return
    }
    const item = { id: Date.now(), type, year, month, name, reason, valueType, value, photos: Array.isArray(draft.photos) ? draft.photos : [], pawText: line, pawCount: 1, createdAt: Date.now() }
    launchThingGem(item, event)
    setData(prev => ({ ...prev, things: [item, ...(prev.things || [])], thingDraft: { ...EMPTY_THING_DRAFT, type }, thingsSavedAt: Date.now(), lastSavedAt: Date.now() }))
    setSelectedThingId(item.id); setShowAddForm(false)
  }
  function applyThingMove(id, nextType) {
    const current = things.find(item => item.id === id); if (!current) return
    const line = nextType === 'treasure' ? `你得到「${current.name}」，雪粒为你高兴。` : `明白了。「${current.name}」进入舍离区，留下记录，也腾出空间。`
    setData(prev => ({ ...prev, things: (prev.things || []).map(item => item.id === id ? { ...item, type: nextType, pawText: line, pawCount: Number(item.pawCount || 0) + 1 } : item), thingsSavedAt: Date.now(), lastSavedAt: Date.now() }))
    setThingsMode(nextType); setSelectedThingId(id)
  }
  function moveThing(id, nextType) {
    const current = things.find(item => item.id === id); if (!current) return
    if ((current.type === 'wish' && nextType !== 'treasure') || (current.type === 'treasure' && nextType !== 'memory') || current.type === 'memory') return

    if (current.type === 'wish' && nextType === 'treasure') {
      const text = `确定「${current.name}」已经到手，需要移到在手区吗？它将从愿单进入此刻拥有。`
      setPendingThingMove({
        id,
        nextType,
        title: '确认拥有',
        text,
        confirmLabel: '确认',
        cancelLabel: '取消',
      })
      return
    }

    if (current.type === 'treasure' && nextType === 'memory') {
      const text = `确定把「${current.name}」放进舍离吗？它将只留在电子空间里，帮助你腾出真实空间。`
      setPendingThingMove({
        id,
        nextType,
        title: '确认舍离',
        text,
        confirmLabel: '确认舍离',
        cancelLabel: '暂时留下',
      })
    }
  }
  function startEditThing(item) {
    if (!item) return
    setEditingThingId(item.id); setSelectedThingId(null); setShowAddForm(true)
    setData(prev => ({ ...prev, thingDraft: { type: item.type || thingsMode, year: item.year || '', month: item.month || '', name: item.name || '', reason: item.reason || '', photos: Array.isArray(item.photos) ? item.photos : [], valueType: item.valueType || (thingIsPriceless(item) ? 'priceless' : 'gold'), value: item.value || '' } }))
    setThingsMode(item.type || thingsMode)
  }
  function requestDeleteThing(id) { const current = things.find(item => item.id === id); if (current) setPendingThingDelete({ id, title: '删除记录', text: `确定删除「${current.name}」吗？删除后，这件物品和它的爪印记录都会消失。` }) }
  function confirmDeleteThing(id) {
    setData(prev => ({ ...prev, things: (prev.things || []).filter(item => item.id !== id), thingDraft: { ...EMPTY_THING_DRAFT, type: thingsMode === 'overview' ? 'wish' : thingsMode }, thingsSavedAt: Date.now(), lastSavedAt: Date.now() }))
    if (selectedThingId === id) setSelectedThingId(null); if (editingThingId === id) setEditingThingId(null); setPendingThingDelete(null)
  }
  function toggleThingsSort(key) { setThingsSort(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' })) }
  function thingSortMark(key) { return thingsSort.key !== key ? '' : thingsSort.direction === 'asc' ? ' ↑' : ' ↓' }
  function openThingFromOverview(item) { setThingsMode(item.type); setSelectedThingId(item.id); updateThingDraft('type', item.type); selectThing(item.id) }
  function compressThingPhoto(file, index = 0) {
    return new Promise(resolve => {
      if (!file || !file.type?.startsWith('image/')) {
        resolve(null)
        return
      }

      const reader = new FileReader()
      reader.onload = () => {
        const source = String(reader.result || '')
        const image = new Image()

        image.onload = () => {
          const maxSide = 320
          const scale = Math.min(
            1,
            maxSide / Math.max(image.width || 1, image.height || 1),
          )
          const width = Math.max(1, Math.round(image.width * scale))
          const height = Math.max(1, Math.round(image.height * scale))
          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height
          const context = canvas.getContext('2d')

          if (!context) {
            resolve({
              id: `thing-web-photo-${Date.now()}-${index}`,
              assetIdentifier: '',
              uri: '',
              thumbnail: source,
              source: 'web-thumbnail-only',
            })
            return
          }

          context.drawImage(image, 0, 0, width, height)
          resolve({
            id: `thing-web-photo-${Date.now()}-${index}`,
            assetIdentifier: '',
            uri: '',
            thumbnail: canvas.toDataURL('image/jpeg', 0.62),
            source: 'web-thumbnail-only',
          })
        }

        image.onerror = () => resolve(null)
        image.src = source
      }
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(file)
    })
  }

  async function handleThingPhotos(files = null) {
    try {
      let pickedPhotos = []

      if (isPhotoIndexAvailable()) {
        pickedPhotos = await pickPhotoIndexes()
      } else {
        const pickedFiles = Array.from(files || [])
        pickedPhotos = (
          await Promise.all(
            pickedFiles.map((file, index) =>
              compressThingPhoto(file, index),
            ),
          )
        ).filter(Boolean)
      }

      if (!pickedPhotos.length) return

      setData(prev => {
        const current = prev.thingDraft || EMPTY_THING_DRAFT
        return {
          ...prev,
          thingDraft: {
            ...current,
            photos: [
              ...(Array.isArray(current.photos) ? current.photos : []),
              ...pickedPhotos,
            ],
          },
          lastSavedAt: Date.now(),
        }
      })
    } catch (error) {
      showThingMessage(
        '照片没有保存成功',
        String(error?.message || error || '请稍后再试。'),
      )
    }
  }

  function removeThingDraftPhoto(index) {
    setData(prev => {
      const current = prev.thingDraft || EMPTY_THING_DRAFT
      return {
        ...prev,
        thingDraft: {
          ...current,
          photos: (current.photos || []).filter(
            (_, photoIndex) => photoIndex !== index,
          ),
        },
        lastSavedAt: Date.now(),
      }
    })
  }

  async function openThingPhoto(photo, photos, index) {
    if (!photo) return

    if (isPhotoIndexAvailable() && (photo.assetIdentifier || photo.uri)) {
      try {
        await presentIndexedPhoto(photo, photos, index)
      } catch (error) {
        showThingMessage(
          '原照片无法打开',
          String(
            error?.message
              || error
              || '原照片可能已被删除，或相册访问权限已经改变。',
          ),
        )
      }
    }
  }

  return <>
    <div className={`thingsOverlay${showThingsInfo ? ' thingsOverlay-info' : ''}${showGemGallery ? ' thingsOverlay-gems' : ''}`}>
      <div className={`thingsPanel thingsPanelBlue ${showGemGallery ? 'thingsPanel-gems' : `thingsPanel-${thingsMode}`}${showThingsInfo ? ' thingsPanel-info' : ''}`}>
        <header className="thingsTopBar thingsUnifiedHeader">
          <button className="thingsBackBtn" type="button" onClick={goBack} aria-label={thingsMode === 'overview' ? '返回主页' : '返回物馆总览'}>‹</button>
          <h2>{thingPanelTitle}</h2>
          {!showThingsInfo && !showGemGallery && thingsMode === 'overview' && (
            <button type="button" className="thingsUsageLink thingsUsageLinkTop" onClick={() => setShowThingsInfo(true)}>说明</button>
          )}
        </header>

        {showGemGallery ? (
          <section className="thingsGemGalleryPage">
            <div className={`thingsGemShowcase${isGemArrangeMode ? ' isArranging' : ''}`}>
              <div className="thingsGemShowcaseGrid" aria-label={`共${things.length}颗宝石`}>
                {displayedGemThings.map(item => {
                  const pos = gemPositions[item.id] || { x: 0, y: 0 }
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className="thingsGemShowcaseGemButton"
                      style={{ transform: `translate(${Number(pos.x || 0)}px, ${Number(pos.y || 0)}px)` }}
                      onPointerDown={event => startGemDrag(event, item)}
                      onPointerMove={moveGemDrag}
                      onPointerUp={endGemDrag}
                      onPointerCancel={endGemDrag}
                      onClick={() => openGemDetail(item)}
                      aria-label={isGemArrangeMode ? `移动${item.name || '物品'}宝石` : `查看${item.name || '物品'}基本信息`}
                    >
                      <img className="thingsGemShowcaseGem" src={thingGemSrc(item)} alt="" />
                    </button>
                  )
                })}
              </div>
              {gemDetailItem && !isGemArrangeMode && (
                <div className="thingsGemMiniDetail" role="dialog" aria-label={`${gemDetailItem.name || '物品'}基本信息`}>
                  <button type="button" className="thingsGemMiniDetailClose" onClick={() => setGemDetailId(null)} aria-label="关闭">×</button>
                  <div><span>年月</span><strong>{thingStartLabel(gemDetailItem)}</strong></div>
                  <div><span>物名</span><strong>{gemDetailItem.name}</strong></div>
                  <div><span>估值</span><strong>{thingValueLabel(gemDetailItem)}</strong></div>
                </div>
              )}
            </div>
            <div className="thingsGemToolbar">
              <span className="thingsGemShowcaseCount">共 {things.length} 件，点宝石看详情，可手动排版。</span>
              <div className="thingsGemToolbarActions">
                <button type="button" className="thingsGemArrangeLink" onClick={toggleGemArrangeMode}>{isGemArrangeMode ? '保存' : '排版'}</button>
                <button
                  type="button"
                  className="thingsGemResetButton"
                  onClick={resetOrSortGems}
                  aria-label={isGemArrangeMode || hasManualGemLayout ? '清空排版并恢复记录顺序' : (gemOrderMode === 'chronological' ? '按类型排序' : '恢复记录顺序')}
                  title={isGemArrangeMode || hasManualGemLayout ? '复位' : (gemOrderMode === 'chronological' ? '按类型排序' : '按记录排序')}
                >↻</button>
              </div>
            </div>
            <aside className="thingsGemLegend" aria-label="宝石图例">
              <h3></h3>
              <div className="thingsGemLegendList">
                {THING_GEM_LEGEND.map(entry => <div className="thingsGemLegendItem" key={entry.src}><img src={entry.src} alt="" /><span>{entry.label}</span></div>)}
              </div>
            </aside>
          </section>
        ) : showThingsInfo ? (
          <section className="thingsInfoPage">
            <div className="thingsInfoText">
              <p>物品可以是高值资产、小物件、礼物、作品等。每条记录获一个宝石图标，点击储物箱查看、排版。</p>
              <p>每件物品可上传多张照片。估值可以是无价，也可以每金粒1000元人民币折算。</p>
              <p>物品到手或舍离后可直接转移记录，保留原来数据。记录可随时编辑或删除。</p>
              <p>每次查看，雪粒会留下爪印，点击次数越多，爪印就越长和越深。</p>
            </div>
          </section>
        ) : thingsMode === 'overview' ? (
          <div className="thingsOverview">
            <div className="thingsProgressLine"><div ref={thingsCrateRef} className="thingsProgressCrate" role="button" tabIndex={0} aria-label={`打开宝石展示，共${things.length}件`} onClick={() => setShowGemGallery(true)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setShowGemGallery(true) } }}><div className="thingsCrateGems" aria-hidden="true">{visibleThingGems.map(item => <img key={item.id} className="thingsCrateGem" src={thingGemSrc(item)} alt="" />)}</div></div></div>
            <div className="thingsOverviewGrid">{Object.entries(THING_TYPES).map(([key, label]) => { const count = things.filter(item => item.type === key).length; return <section key={key} className={`thingOverviewButton thingOverviewButton-${key}`}><span className="thingCategoryTitle">{label}</span><span className="thingCategoryCount"><button type="button" className="thingCaptionCount" onClick={() => openThings(key)}>{count}</button><span className="thingCategoryUnit">件</span></span><span className="thingCategoryGold">估值 <span className="thingBlueNumber">{thingTotals[key]?.gold || 0}</span> 金粒</span><span className="thingCategoryPriceless">无价 <span className="thingBlueNumber">{thingTotals[key]?.priceless || 0}</span> 件</span></section> })}</div>
            <div className="thingsNameList thingsOverviewTableWrap">{things.length === 0 && <p className="thingsEmpty"></p>}{things.length > 0 && <div className="thingsOverviewTable"><button className="thingsTableHead" onClick={() => toggleThingsSort('name')}>物品名称描述{thingSortMark('name')}</button><button className="thingsTableHead" onClick={() => toggleThingsSort('start')}>起始{thingSortMark('start')}</button><button className="thingsTableHead" onClick={() => toggleThingsSort('status')}>类{thingSortMark('status')}</button><button className="thingsTableHead thingsValueHead" onClick={() => toggleThingsSort('value')}>估值{thingSortMark('value')}</button>{sortedThings.map(item => <div className="thingsTableRowGroup" key={item.id}><button className="thingsTableCell thingsTableName" onClick={() => openThingFromOverview(item)}><span className="thingsTableThumb">{item.photos?.[0]?.thumbnail ? <img src={item.photos[0].thumbnail} alt="" /> : <span>📁</span>}</span><span>{item.name}<ThingPaws item={item} className="thingRowPaws" /></span></button><span className="thingsTableCell">{thingStartLabel(item)}</span><span className="thingsTableCell">{THING_TYPES[item.type]}</span><span className="thingsTableCell">{thingValueLabel(item)}</span></div>)}</div>}</div>
            <img className="thingsOverviewBottomCat" src={THING_CAT_IMAGES.overview} alt="雪粒馆长" />
            <nav className="thingsOverviewBottomLinks" aria-label="物馆分类">
              <button type="button" onClick={() => openThings('wish')}>愿单</button>
              <button type="button" onClick={() => openThings('treasure')}>在手</button>
              <button type="button" onClick={() => openThings('memory')}>舍离</button>
            </nav>
          </div>
        ) : (
          <div className={`thingsSubPage ${showAddForm ? 'isAdding' : ''}`}>
            <div className="thingsLayout">
              {showAddForm ? <section className="thingsAddCard">
                <div className="thingsAddCardHead">
                  <h3>{editingThingId ? `编辑` : `添加`}</h3>
                  <button type="button" className="thingsAddClose" onClick={closeThingForm} aria-label="收起添加记录">×</button>
                </div>


                <label className="thingFieldLabel">
                  物名（不超10汉字或20个字母）
                  <input
                    className="thingNameInput"
                    placeholder="如用品、珍藏、车、房、作品"
                    value={thingDraft.name || ''}
                    onCompositionStart={() => { nameComposingRef.current = true }}
                    onCompositionEnd={e => {
                      nameComposingRef.current = false
                      updateThingDraft('name', limitThingText(e.currentTarget.value, THING_NAME_MAX_UNITS))
                    }}
                    onChange={e => updateThingDraft(
                      'name',
                      nameComposingRef.current
                        ? e.target.value
                        : limitThingText(e.target.value, THING_NAME_MAX_UNITS),
                    )}
                  />
                </label>

                <label className="thingFieldLabel thingInlineField">
                  <span className="thingInlineFieldTitle">起始</span>
                  <div className="thingDateGrid">
                    <input
                      placeholder="年，例如 2026"
                      value={thingDraft.year || ''}
                      onChange={e => updateThingDraft('year', e.target.value)}
                    />
                    <input
                      placeholder="月，例如 7"
                      value={thingDraft.month || ''}
                      onChange={e => updateThingDraft('month', e.target.value)}
                    />
                  </div>
                </label>

                <label className="thingFieldLabel thingInlineField">
                  <span className="thingInlineFieldTitle">估值</span>
                  <div className="thingValueGrid">
                    <select
                      value={thingDraft.valueType || 'priceless'}
                      onChange={e => updateThingDraft('valueType', e.target.value)}
                    >
                      <option value="priceless">无价</option>
                      <option value="gold">金粒</option>
                    </select>
                    <input
                      className="thingValueInput"
                      type="number"
                      min="0"
                      placeholder="1金粒=￥1000元"
                      value={thingDraft.value || ''}
                      disabled={(thingDraft.valueType || 'priceless') === 'priceless'}
                      onChange={e => updateThingDraft('value', e.target.value)}
                    />
                  </div>
                </label>

                <label className="thingFieldLabel thingReasonField">
                  描述 （不少于4汉字或8个字母）
                  <textarea
                    placeholder={THING_COPY[thingsMode]?.placeholder}
                    value={thingDraft.reason || ''}
                    onChange={e => updateThingDraft('reason', e.target.value)}
                  />
                </label>

                <div className="thingPhotoActionRow">
                  {isPhotoIndexAvailable() ? (
                    <button
                      type="button"
                      className="thingPhotoUpload thingPhotoIndexUpload"
                      onClick={() => handleThingPhotos()}
                      aria-label="从照片图库选择照片"
                    >
                      <img className="thingPhotoUploadIcon" src="/refine/footprint_photoicon.png" alt="" aria-hidden="true" />
                      <small>上传照片</small>
                    </button>
                  ) : (
                    <label className="thingPhotoUpload">
                      <img className="thingPhotoUploadIcon" src="/refine/footprint_photoicon.png" alt="" aria-hidden="true" />
                      <small>上传照片</small>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={e => {
                          handleThingPhotos(e.target.files)
                          e.currentTarget.value = ''
                        }}
                      />
                    </label>
                  )}

                  <button
                    type="button"
                    className="saveThingBtn saveThingBtnInline"
                    disabled={
                      !thingDraft.year
                      || !thingDraft.month
                      || !thingDraft.name
                      || thingTextUnits(thingDraft.name) > THING_NAME_MAX_UNITS
                      || !thingDraft.reason
                      || thingTextUnits(thingDraft.reason) < THING_REASON_MIN_UNITS
                      || ((thingDraft.valueType || 'priceless') === 'gold' && !thingDraft.value)
                    }
                    onClick={saveThing}
                  >
                    {editingThingId ? '保存修改' : '保存新增'}
                  </button>
                </div>

                {Array.isArray(thingDraft.photos) && thingDraft.photos.length > 0 && (
                  <div className="thingPhotoDraftGrid">
                    {thingDraft.photos.map((photo, index) => (
                      <div
                        className="thingPhotoDraftItem"
                        key={photo.id || photo.assetIdentifier || photo.uri || index}
                      >
                        <img src={photo.thumbnail} alt={`物品照片${index + 1}`} />
                        <button
                          type="button"
                          className="thingPhotoDeleteButton"
                          onClick={event => {
                            event.preventDefault()
                            event.stopPropagation()
                            removeThingDraftPhoto(index)
                          }}
                          aria-label={`删除物品照片${index + 1}`}
                          title="删除照片"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section> : <>
              <section className="thingsListCard"><div className="thingsListHeader"><span>{currentThingList.length}件 · {thingTotals[thingsMode]?.gold || 0} 金粒 · {thingTotals[thingsMode]?.priceless || 0} 件无价</span></div><div className="thingsList">{currentThingList.map(item => <button key={item.id} className={selectedThing?.id === item.id ? 'thingListItem active' : 'thingListItem'} onClick={() => selectThing(item.id)}><small>{item.year}年{item.month}月</small><strong>{item.name}</strong></button>)}</div></section>
              <section className="thingDetailCard">{selectedThing ? <>{Array.isArray(selectedThing.photos) && selectedThing.photos.length > 0 ? <div className="thingDetailPhotoGrid">{selectedThing.photos.map((photo, index) => <button type="button" className="thingDetailPhotoButton" key={photo.id || photo.assetIdentifier || photo.uri || index} onClick={() => openThingPhoto(photo, selectedThing.photos, index)}><img src={photo.thumbnail} alt={`${selectedThing.name}照片${index + 1}`} /></button>)}</div> : <div className="thingDetailPhoto thingDetailPhotoEmpty">🐾</div>}<h3>{selectedThing.name}</h3><small>{selectedThing.year}年{selectedThing.month}月 · {THING_TYPES[selectedThing.type]} · 估值 {thingValueLabel(selectedThing)}</small><p className="thingReason">{selectedThing.reason}</p><div className="thingPawSeal"><div className="thingSealLine thingVisitLine"><ThingPaws item={selectedThing} className="thingVisitPaws" compact /><p>雪粒已经来看过 {Number(selectedThing.pawCount || 1)} 次。</p></div><div className="thingActionButtons">{selectedThing.type === 'wish' && <button onClick={() => moveThing(selectedThing.id, 'treasure')}>此物到手</button>}{selectedThing.type === 'treasure' && <button onClick={() => moveThing(selectedThing.id, 'memory')}>舍离此物</button>}<button className="thingIconAction deleteThingBtn" title="删除记录" aria-label="删除记录" onClick={() => requestDeleteThing(selectedThing.id)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5" /></svg></button><button className="thingIconAction" title="编辑修改" aria-label="编辑修改" onClick={() => startEditThing(selectedThing)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l11-11-4-4L4 16v4Zm9-13 4 4" /></svg></button></div></div></> : null}</section></>}
            </div>
            {!showAddForm && <button type="button" className="thingsAddLink" onClick={openAddThing}>＋ 添加记录</button>}
          </div>
        )}
      </div>
    </div>
    {pendingThingDelete && <div className="noticeOverlay"><div className="noticeBox thingConfirmBox thingDeleteConfirmBox"><h2>{pendingThingDelete.title}</h2><p>{pendingThingDelete.text}</p><div className="thingConfirmButtons"><button className="dangerConfirmBtn" onClick={() => confirmDeleteThing(pendingThingDelete.id)}>确认删除</button><button onClick={() => setPendingThingDelete(null)}>再想想</button></div></div></div>}
    {pendingThingMove && <div className="noticeOverlay"><div className="noticeBox thingConfirmBox"><h2>{pendingThingMove.title}</h2><p>{pendingThingMove.text}</p><div className="thingConfirmButtons"><button onClick={() => { const pending = pendingThingMove; setPendingThingMove(null); applyThingMove(pending.id, pending.nextType) }}>{pendingThingMove.confirmLabel || '确认'}</button><button onClick={() => setPendingThingMove(null)}>{pendingThingMove.cancelLabel || '取消'}</button></div></div></div>}
    {thingModal && <div className="noticeOverlay"><div className="noticeBox thingQuietModal"><button type="button" className="thingModalClose" onClick={() => setThingModal(null)} aria-label="关闭">×</button><h2>{thingModal.title}</h2><p>{thingModal.text}</p></div></div>}
    {flyingGem && <img className="thingGemFlying" src={flyingGem.src} alt="" aria-hidden="true" style={{ left: `${flyingGem.startX}px`, top: `${flyingGem.startY}px`, '--thing-gem-mid-x': `${flyingGem.midX}px`, '--thing-gem-mid-y': `${flyingGem.midY}px`, '--thing-gem-end-x': `${flyingGem.endX}px`, '--thing-gem-end-y': `${flyingGem.endY}px` }} />}
  </>
}
