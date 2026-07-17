import { useEffect, useMemo, useRef, useState } from 'react'
import './Things.css'

const THING_TYPES = { wish: '愿单', treasure: '在手', memory: '舍离' }
const THING_COPY = {
  wish: { title: '我的愿单', reasonLabel: '为什么期待', placeholder: '例如：它能改善我的生活，或者它是我长期真正想靠近的物。', catLine: '我理解了，此物值得期待。' },
  treasure: { title: '此刻拥有', reasonLabel: '为什么珍贵', placeholder: '例如：它正在陪伴我的生活，或者它代表一个阶段的自己。', catLine: '我理解了，此物值得拥有。' },
  memory: { title: '舍离区', reasonLabel: '为什么难忘', placeholder: '例如：它已经不在了，但它陪过我，所以值得被记住。', catLine: '我理解了，此物值得记住。它离开了，但没有消失。' },
}
const THING_LIMIT = 300
const GOLD_PRICE_LABEL = '约1250元/金粒'
const PAW_STEP = 10
const THING_CAT_IMAGES = { overview: '/refine/things_general_cat.png' }
const EMPTY_THING_DRAFT = { type: 'wish', year: '', month: '', name: '', reason: '', photo: '', valueType: 'priceless', value: '' }
const THING_STATUS_ORDER = { treasure: 0, wish: 1, memory: 2 }

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


function thingProgressStage(count) {
  const n = Number(count || 0)
  if (n <= 50) return { title: '简约主义', desc: '有待添加记录' }
  if (n <= 100) return { title: '积攒中', desc: '空间仍很充裕' }
  if (n <= 150) return { title: '不多不少', desc: '刚刚好' }
  if (n <= 200) return { title: '日趋富足', desc: '生活越来越完整' }
  return { title: '近乎圆满', desc: '每件都有故事' }
}
function thingCategoryCaption(key) { return key === 'wish' ? '等待拥有' : key === 'treasure' ? '陪伴现在' : '留在记忆' }
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
function thingStartKey(item) { return Number(item?.year || 0) * 100 + Number(item?.month || 0) }
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
    return <span className={`thingPaws thingPawsCompact ${className}`} aria-label={`雪球爪印${layers.length}枚`}><span className={`catPawStack catPawStackCompact pawTone-${strongest}`}><img src="/refine/cat_paw.png" alt="" aria-hidden="true" /></span></span>
  }
  return <span className={`thingPaws ${className}`} aria-label={`雪球爪印${layers.length}枚`}>{layers.map((layer, index) => <span className={`catPawStack pawTone-${layer.tone}`} key={index}><img src="/refine/cat_paw.png" alt="" aria-hidden="true" /></span>)}</span>
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
  const [thingsBackupReady, setThingsBackupReady] = useState(false)
  const initialThingsSavedAtRef = useRef(Number(data.thingsSavedAt || 0))

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
        const backupHasPhotos = Boolean(backupThings?.some(item => item?.photo))
        const localHasPhotos = Boolean(localThings.some(item => item?.photo))

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
  const nameComposingRef = useRef(false)
  const [showAddForm, setShowAddForm] = useState(false)

  const things = data.things || []
  const thingDraft = data.thingDraft || EMPTY_THING_DRAFT
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
  const thingProgress = thingProgressStage(things.length)
  const thingPanelTitle = showThingsInfo ? '使用说明' : (thingsMode === 'overview' ? '物品档案' : THING_COPY[thingsMode]?.title || '物品档案')

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
    if (showThingsInfo) { setShowThingsInfo(false); return }
    if (thingsMode === 'overview') onClose(); else openThings('overview')
  }
  function thingTypeVerb(type) { return type === 'wish' ? '期待' : type === 'treasure' ? '拥有' : '记住' }
  function showThingMessage(title, text) { setThingModal({ title, text }) }
  function reasonStrongEnough(reason) {
    const clean = String(reason || '').replace(/\s/g, '')
    if (clean.length < 8) return false
    return !(clean.length < 14 && ['喜欢', '好看', '想要', '不错', '随便', '不知道'].some(word => clean.includes(word)))
  }
  function selectThing(id) {
    setSelectedThingId(id)
    setData(prev => ({ ...prev, things: (prev.things || []).map(item => item.id === id ? { ...item, pawCount: Number(item.pawCount || 0) + 1, lastViewedAt: Date.now() } : item), thingsSavedAt: Date.now(), lastSavedAt: Date.now() }))
  }
  function saveThing() {
    const draft = data.thingDraft || EMPTY_THING_DRAFT
    const type = draft.type || thingsMode || 'wish'
    const year = String(draft.year || '').trim(), month = String(draft.month || '').trim(), name = String(draft.name || '').trim(), reason = String(draft.reason || '').trim()
    const valueType = draft.valueType || 'priceless', value = valueType === 'gold' ? String(draft.value || '').trim() : ''
    if (!year || !month || !name || !reason || (valueType === 'gold' && !value) || (!editingThingId && things.length >= THING_LIMIT)) return
    if (!reasonStrongEnough(reason)) { showThingMessage('雪球没有盖章', `你的理由不充分哦。再写清楚一点：为什么它值得${thingTypeVerb(type)}？`); return }
    const line = `我理解了，此物值得${thingTypeVerb(type)}。`
    if (editingThingId) {
      const savedId = editingThingId
      setData(prev => ({ ...prev, things: (prev.things || []).map(item => item.id === savedId ? { ...item, type, year, month, name, reason, valueType, value, photo: draft.photo || '', pawText: line, updatedAt: Date.now() } : item), thingDraft: { ...EMPTY_THING_DRAFT, type }, thingsSavedAt: Date.now(), lastSavedAt: Date.now() }))
      setEditingThingId(null); setSelectedThingId(savedId); setThingsMode(type); setShowAddForm(false); showThingMessage('雪球已更新', '我理解了，记录已经改好。'); return
    }
    const item = { id: Date.now(), type, year, month, name, reason, valueType, value, photo: draft.photo || '', pawText: line, pawCount: 1, createdAt: Date.now() }
    setData(prev => ({ ...prev, things: [item, ...(prev.things || [])], thingDraft: { ...EMPTY_THING_DRAFT, type }, thingsSavedAt: Date.now(), lastSavedAt: Date.now() }))
    setSelectedThingId(item.id); setShowAddForm(false); showThingMessage('雪球已盖章', line)
  }
  function applyThingMove(id, nextType) {
    const current = things.find(item => item.id === id); if (!current) return
    const line = nextType === 'treasure' ? `恭喜你得到「${current.name}」。` : `雪球明白了。「${current.name}」进入舍离区，留下记录，也腾出空间。`
    setData(prev => ({ ...prev, things: (prev.things || []).map(item => item.id === id ? { ...item, type: nextType, pawText: line, pawCount: Number(item.pawCount || 0) + 1 } : item), thingsSavedAt: Date.now(), lastSavedAt: Date.now() }))
    setThingsMode(nextType); setSelectedThingId(id); showThingMessage(nextType === 'treasure' ? '雪球祝贺你' : '雪球确认舍离', line)
  }
  function moveThing(id, nextType) {
    const current = things.find(item => item.id === id); if (!current) return
    if ((current.type === 'wish' && nextType !== 'treasure') || (current.type === 'treasure' && nextType !== 'memory') || current.type === 'memory') return
    if (current.type === 'treasure' && nextType === 'memory') { const text = `确定把「${current.name}」放进舍离吗？它将只留在电子空间里，帮助你腾出真实空间。`; setPendingThingMove({ id, nextType, title: '确认舍离', text }); return }
    applyThingMove(id, nextType)
  }
  function startEditThing(item) {
    if (!item) return
    setEditingThingId(item.id); setSelectedThingId(null); setShowAddForm(true)
    setData(prev => ({ ...prev, thingDraft: { type: item.type || thingsMode, year: item.year || '', month: item.month || '', name: item.name || '', reason: item.reason || '', photo: item.photo || '', valueType: item.valueType || (thingIsPriceless(item) ? 'priceless' : 'gold'), value: item.value || '' } }))
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
  function handleThingPhoto(file) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const source = String(reader.result || '')
      const image = new Image()
      image.onload = () => {
        const maxSide = 900
        const scale = Math.min(1, maxSide / Math.max(image.width || 1, image.height || 1))
        const width = Math.max(1, Math.round(image.width * scale))
        const height = Math.max(1, Math.round(image.height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d')
        if (!context) {
          updateThingDraft('photo', source)
          return
        }
        context.drawImage(image, 0, 0, width, height)
        const compressed = canvas.toDataURL('image/jpeg', 0.78)
        updateThingDraft('photo', compressed)
      }
      image.onerror = () => updateThingDraft('photo', source)
      image.src = source
    }
    reader.readAsDataURL(file)
  }

  return <>
    <div className="thingsOverlay">
      <div className={`thingsPanel thingsPanelBlue thingsPanel-${thingsMode}${showThingsInfo ? ' thingsPanel-info' : ''}`}>
        <header className="thingsTopBar thingsUnifiedHeader">
          <button className="thingsBackBtn" type="button" onClick={goBack} aria-label={thingsMode === 'overview' ? '返回主页' : '返回物馆总览'}>‹</button>
          <h2>{thingPanelTitle}</h2>
          {!showThingsInfo && thingsMode === 'overview' && (
            <button type="button" className="thingsUsageLink thingsUsageLinkTop" onClick={() => setShowThingsInfo(true)}>说明</button>
          )}
        </header>

        {showThingsInfo ? (
          <section className="thingsInfoPage">
            <div className="thingsInfoText">
              <p>物馆记录愿望、拥有和舍离。愿单放下期待，在手留下正在陪伴的物，舍离保存已经离开的东西。</p>
              <p>物品可以填写照片、起始时间、理由和估值。无价不等于没有价值，只是不以金粒计算。</p>
              <p>愿单到手后可以移入在手，在手舍离后可以留在舍离。记录可以随时编辑或删除。</p>
              <p>每次查看，雪球都会留下爪印。物馆是你与物品之间的记忆档案。</p>
            </div>
          </section>
        ) : thingsMode === 'overview' ? (
          <div className="thingsOverview">
            <div className="thingsProgressLine"><div className="thingsProgressCrate" aria-label={`物馆进度${things.length}/${THING_LIMIT}`}><span>{things.length}/{THING_LIMIT}</span><div className="thingsCrateFill" style={{ width: `${things.length > 0 ? Math.max(8, Math.min(100, (things.length / THING_LIMIT) * 100)) : 0}%` }} /></div><div className="thingsProgressText"><strong>{thingProgress.title}</strong><small>{thingProgress.desc}</small></div></div>
            <div className="thingsOverviewGrid">{Object.entries(THING_TYPES).map(([key, label]) => { const count = things.filter(item => item.type === key).length; return <section key={key} className={`thingOverviewButton thingOverviewButton-${key}`}><span className="thingCategoryTitle">{label}</span><span className="thingCategoryCaption">{thingCategoryCaption(key)}</span><span className="thingCategoryCount"><button type="button" className="thingCaptionCount" onClick={() => openThings(key)}>{count}</button><span className="thingCategoryUnit">件</span></span><span className="thingCategoryGold">估值 {thingTotals[key]?.gold || 0}金粒</span><span className="thingCategoryPriceless">无价 {thingTotals[key]?.priceless || 0}件</span></section> })}</div>
            <div className="thingsNameList thingsOverviewTableWrap"><h3>物馆总览</h3><div className="thingsGoldPriceAbove">金价：{GOLD_PRICE_LABEL}</div>{things.length === 0 && <p className="thingsEmpty">物馆还空着。可以先从一件愿单开始。</p>}{things.length > 0 && <div className="thingsOverviewTable"><button className="thingsTableHead" onClick={() => toggleThingsSort('name')}>物名{thingSortMark('name')}</button><button className="thingsTableHead" onClick={() => toggleThingsSort('start')}>起始{thingSortMark('start')}</button><button className="thingsTableHead" onClick={() => toggleThingsSort('status')}>状态{thingSortMark('status')}</button><button className="thingsTableHead thingsValueHead" onClick={() => toggleThingsSort('value')}>估值{thingSortMark('value')}</button>{sortedThings.map(item => <div className="thingsTableRowGroup" key={item.id}><button className="thingsTableCell thingsTableName" onClick={() => openThingFromOverview(item)}><span className="thingsTableThumb">{item.photo ? <img src={item.photo} alt="" /> : <span>📁</span>}</span><span>{item.name}<ThingPaws item={item} className="thingRowPaws" /></span></button><span className="thingsTableCell">{item.year}年{item.month}月</span><span className="thingsTableCell">{THING_TYPES[item.type]}</span><span className="thingsTableCell">{thingValueLabel(item)}</span></div>)}</div>}</div>
            <img className="thingsOverviewBottomCat" src={THING_CAT_IMAGES.overview} alt="雪球馆长" />
            <nav className="thingsOverviewBottomLinks" aria-label="物馆分类">
              <button type="button" onClick={() => openThings('wish')}>愿单</button>
              <button type="button" onClick={() => openThings('treasure')}>在手</button>
              <button type="button" onClick={() => openThings('memory')}>舍离</button>
            </nav>
          </div>
        ) : (
          <div className={`thingsSubPage ${showAddForm ? 'isAdding' : ''}`}>
            <div className="thingsLayout">
              {showAddForm ? <section className="thingsAddCard"><div className="thingsAddCardHead"><h3>{editingThingId ? `${THING_TYPES[thingsMode]} · 编辑记录` : `${THING_TYPES[thingsMode]} · 添加记录`}</h3><button type="button" className="thingsAddClose" onClick={closeThingForm} aria-label="收起添加记录">×</button></div><p className="thingHint">{THING_COPY[thingsMode]?.reasonLabel}是门槛。</p><label className="thingPhotoUpload">{thingDraft.photo ? <img src={thingDraft.photo} alt="物品照片预览" /> : <><span className="thingFolderIcon">📁</span><small>上传照片</small></>}<input type="file" accept="image/*" onChange={e => handleThingPhoto(e.target.files?.[0])} /></label><label className="thingFieldLabel">物名（8字内）<input className="thingNameInput" placeholder="例如 手表 / 旧相机" value={thingDraft.name || ''} onCompositionStart={() => { nameComposingRef.current = true }} onCompositionEnd={e => { nameComposingRef.current = false; updateThingDraft('name', e.currentTarget.value.slice(0, 8)) }} onChange={e => updateThingDraft('name', nameComposingRef.current ? e.target.value : e.target.value.slice(0, 8))} /></label><label className="thingFieldLabel">起始<div className="thingDateGrid"><input placeholder="年，例如 2026" value={thingDraft.year || ''} onChange={e => updateThingDraft('year', e.target.value)} /><input placeholder="月，例如 7" value={thingDraft.month || ''} onChange={e => updateThingDraft('month', e.target.value)} /></div></label><label className="thingFieldLabel">估值<div className="thingValueGrid"><select value={thingDraft.valueType || 'priceless'} onChange={e => updateThingDraft('valueType', e.target.value)}><option value="priceless">无价</option><option value="gold">金粒</option></select><input className="thingValueInput" type="number" min="0" placeholder="1金粒=1克黄金" value={thingDraft.value || ''} disabled={(thingDraft.valueType || 'priceless') === 'priceless'} onChange={e => updateThingDraft('value', e.target.value)} /></div></label><label className="thingFieldLabel">描述<textarea placeholder={THING_COPY[thingsMode]?.placeholder} value={thingDraft.reason || ''} onChange={e => updateThingDraft('reason', e.target.value)} /></label><div className="thingPawPreview"><span>👁️</span><p>雪球会查看你的理由。</p></div><button className="saveThingBtn" disabled={(!editingThingId && things.length >= THING_LIMIT) || !thingDraft.year || !thingDraft.month || !thingDraft.name || !thingDraft.reason || ((thingDraft.valueType || 'priceless') === 'gold' && !thingDraft.value)} onClick={saveThing}>{editingThingId ? '保存修改' : '让雪球盖章'}</button></section> : <>
              <section className="thingsListCard"><div className="thingsListHeader"><span>{currentThingList.length}件 · {thingTotals[thingsMode]?.gold || 0} 金粒 · {thingTotals[thingsMode]?.priceless || 0} 件无价</span></div><div className="thingsList">{currentThingList.map(item => <button key={item.id} className={selectedThing?.id === item.id ? 'thingListItem active' : 'thingListItem'} onClick={() => selectThing(item.id)}><small>{item.year}年{item.month}月</small><strong>{item.name}</strong></button>)}</div></section>
              <section className="thingDetailCard">{selectedThing ? <>{selectedThing.photo ? <img className="thingDetailPhoto" src={selectedThing.photo} alt={selectedThing.name} /> : <div className="thingDetailPhoto thingDetailPhotoEmpty">🐾</div>}<h3>{selectedThing.name}</h3><small>{selectedThing.year}年{selectedThing.month}月 · {THING_TYPES[selectedThing.type]} · 估值 {thingValueLabel(selectedThing)}</small><p className="thingReason">{selectedThing.reason}</p><div className="thingPawSeal"><div className="thingSealLine thingVisitLine"><ThingPaws item={selectedThing} className="thingVisitPaws" compact /><p>雪球已经来看过 {Number(selectedThing.pawCount || 1)} 次。</p></div><div className="thingActionButtons">{selectedThing.type === 'wish' && <button onClick={() => moveThing(selectedThing.id, 'treasure')}>此物到手</button>}{selectedThing.type === 'treasure' && <button onClick={() => moveThing(selectedThing.id, 'memory')}>舍离此物</button>}<button className="thingIconAction deleteThingBtn" title="删除记录" aria-label="删除记录" onClick={() => requestDeleteThing(selectedThing.id)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5" /></svg></button><button className="thingIconAction" title="编辑修改" aria-label="编辑修改" onClick={() => startEditThing(selectedThing)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l11-11-4-4L4 16v4Zm9-13 4 4" /></svg></button></div></div></> : null}</section></>}
            </div>
            {!showAddForm && <button type="button" className="thingsAddLink" onClick={openAddThing}>＋ 添加记录</button>}
          </div>
        )}
      </div>
    </div>
    {pendingThingDelete && <div className="noticeOverlay"><div className="noticeBox thingConfirmBox thingDeleteConfirmBox"><h2>{pendingThingDelete.title}</h2><p>{pendingThingDelete.text}</p><div className="thingConfirmButtons"><button className="dangerConfirmBtn" onClick={() => confirmDeleteThing(pendingThingDelete.id)}>确认删除</button><button onClick={() => setPendingThingDelete(null)}>再想想</button></div></div></div>}
    {pendingThingMove && <div className="noticeOverlay"><div className="noticeBox thingConfirmBox"><h2>{pendingThingMove.title}</h2><p>{pendingThingMove.text}</p><div className="thingConfirmButtons"><button onClick={() => { const pending = pendingThingMove; setPendingThingMove(null); applyThingMove(pending.id, pending.nextType) }}>确认舍离</button><button onClick={() => setPendingThingMove(null)}>暂时留下</button></div></div></div>}
    {thingModal && <div className="noticeOverlay"><div className="noticeBox thingQuietModal"><button type="button" className="thingModalClose" onClick={() => setThingModal(null)} aria-label="关闭">×</button><h2>{thingModal.title}</h2><p>{thingModal.text}</p></div></div>}
  </>
}
