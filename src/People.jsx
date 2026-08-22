import { useEffect, useMemo, useRef, useState } from 'react'
import './People.css'
import {
  isPhotoIndexAvailable,
  pickPhotoIndexes,
  presentIndexedPhoto,
} from './components/photo-index/photoIndexService.js'

const TEST_PASSWORD = 'snowball'
const PEOPLE_GROUPS = ['家人', '朋友', '工作', '其他']
const PEOPLE_GENDERS = ['女', '男']
const FREQUENCY_OPTIONS = ['每天', '数天', '数月', '数年', '十年以上']

const HISTORY_PRESETS = [
  { key: 'today', months: 0, label: '今天' },
  { key: 'threeMonths', months: -3, label: '3个月前' },
  { key: 'halfYear', months: -6, label: '半年前' },
  { key: 'oneYear', months: -12, label: '1年前' },
  { key: 'twoYears', months: -24, label: '2年前' },
  { key: 'threeYears', months: -36, label: '3年前' },
  { key: 'fiveYears', months: -60, label: '5年前' },
  { key: 'tenYears', months: -120, label: '10年前' },
  { key: 'twentyYears', months: -240, label: '20年前' },
]

const RING_RADII = {
  每天: 15,
  数天: 24,
  数月: 33,
  数年: 40,
  十年以上: 46,
}

const RING_LABELS = FREQUENCY_OPTIONS.map(item => ({
  key: item,
  radius: RING_RADII[item],
}))

const EMPTY_PERSON = {
  id: null,
  name: '',
  nickname: '',
  group: '',
  relation: '',
  gender: '',
  startYear: '',
  startMonth: '',
  endYear: '',
  endMonth: '',
  frequency: '',
  personColor: '#c9d2cd',
  note: '',
  witnessEntries: [],
  history: [],
  photos: [],
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

function hashText(text) {
  const s = String(text || '')
  let seed = 0
  for (let i = 0; i < s.length; i += 1) seed = (seed * 31 + s.charCodeAt(i)) % 9973
  return seed
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

function normalizeMonthOnly(value) {
  const text = String(value || '').trim()
  const match = text.match(/^(\d{4})[-/年](\d{1,2})(?:月)?$/)
  if (!match) return ''
  const year = Number(match[1])
  const month = Number(match[2])
  if (year < 1 || month < 1 || month > 12) return ''
  return `${year}-${pad2(month)}`
}

function monthSlashDraft(value) {
  const normalized = normalizeMonthOnly(value)
  if (!normalized) return ''
  const [year, month] = normalized.split('-')
  return `${year}/${month}`
}

function monthChineseDraft(value) {
  const normalized = normalizeMonthOnly(value)
  if (!normalized) return ''
  const [year, month] = normalized.split('-')
  return `${year}年${month}月`
}

function currentMonthValue() {
  const now = new Date()
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`
}

function addMonthsToValue(value, offset) {
  const { year, month } = monthPartsFromValue(value || currentMonthValue())
  const date = new Date(Number(year), Number(month || 1) - 1 + Number(offset || 0), 1)
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`
}

function formatMonthFull(value) {
  const { year, month } = monthPartsFromValue(value)
  if (!year) return ''
  return `${year}年${pad2(Number(month || 1))}月`
}

function currentMonthIndex() {
  const now = new Date()
  return now.getFullYear() * 12 + now.getMonth() + 1
}

function monthIndex(year, month = 1) {
  const y = Number(year || 0)
  if (!y) return null
  const m = clamp(Number(month || 1) || 1, 1, 12)
  return y * 12 + m
}

function monthValueToIndex(value) {
  const [year, month] = String(value || '').split('-')
  return monthIndex(year, month || 1)
}

function monthValueFromParts(year, month) {
  if (!year) return ''
  return `${year}-${pad2(clamp(Number(month || 1) || 1, 1, 12))}`
}

function monthPartsFromValue(value) {
  const [year, month] = String(value || '').split('-')
  return { year: year || '', month: month || '' }
}

function formatMonthValue(value) {
  const { year, month } = monthPartsFromValue(value)
  if (!year) return '今天'
  return `${year}年${Number(month || 1)}月`
}

function formatDateParts(year, month) {
  if (!year) return '—'
  if (!month) return `${year}年`
  return `${year}年${Number(month)}月`
}

function monthsBetweenParts(year, month, targetMonth = currentMonthValue()) {
  const start = monthIndex(year, month)
  const target = monthValueToIndex(targetMonth) || currentMonthIndex()
  if (!start) return 6
  return Math.max(1, target - start + 1)
}

function selfMonthsKnown(birthDate, targetMonth) {
  const normalized = normalizeMonthOnly(birthDate)
  if (!normalized) return null
  const [year, month] = normalized.split('-')
  return Math.max(1, monthsBetweenParts(year, month || 1, targetMonth))
}

function selfSizeFromBirth(birthDate, targetMonth) {
  const months = selfMonthsKnown(birthDate, targetMonth)
  if (!months) return 0
  const years = months / 12
  const baseSize = 35
  const growth = years > 50 ? 1 + (years - 50) * 0.01 : 1
  return Math.round(baseSize * growth)
}

function normalizePersonColor(value) {
  const color = String(value || '').trim()
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#c9d2cd'
}

function snapshotOf(person) {
  const normalized = normalizePerson(person)
  return {
    name: normalized.name,
    nickname: normalized.nickname,
    group: normalized.group,
    relation: normalized.relation,
    gender: normalized.gender,
    startYear: normalized.startYear,
    startMonth: normalized.startMonth,
    endYear: normalized.endYear,
    endMonth: normalized.endMonth,
    frequency: normalized.frequency,
    personColor: normalized.personColor,
    note: normalized.note,
  }
}

function snapshotForMonth(person, targetMonth) {
  const history = Array.isArray(person.history) ? person.history : []
  const target = monthValueToIndex(targetMonth) || currentMonthIndex()
  const candidates = history
    .filter(item => monthValueToIndex(item?.savedMonth) <= target)
    .sort((a, b) => {
      const ma = monthValueToIndex(a.savedMonth) || 0
      const mb = monthValueToIndex(b.savedMonth) || 0
      if (ma !== mb) return ma - mb
      return Number(new Date(a.savedAt || 0)) - Number(new Date(b.savedAt || 0))
    })
  const latest = candidates[candidates.length - 1]
  return normalizePerson({ ...person, ...(latest?.snapshot || {}) })
}

function relationExistsAt(person, targetMonth) {
  const target = monthValueToIndex(targetMonth) || currentMonthIndex()
  const start = monthIndex(person.startYear, person.startMonth)
  const end = monthIndex(person.endYear, person.endMonth)
  if (start && start > target) return false
  if (end && end < target) return false
  return true
}

function monthsKnown(person, targetMonth) {
  const start = monthIndex(person.startYear, person.startMonth)
  const target = monthValueToIndex(targetMonth) || currentMonthIndex()
  if (!start) return 0
  return Math.max(0, target - start + 1)
}

function sizeFromTime(person, birthDate, targetMonth) {
  const selfMonths = selfMonthsKnown(birthDate, targetMonth)
  if (!selfMonths) return 0
  const personMonths = monthsKnown(person, targetMonth)
  const selfSize = selfSizeFromBirth(birthDate, targetMonth)
  const areaRatio = Math.max(0.10, personMonths / selfMonths)
  return Math.round(clamp(selfSize * Math.sqrt(areaRatio), 12, 180))
}

function distanceFromFrequency(frequency) {
  return RING_RADII[frequency] || RING_RADII['数月']
}

function dotColorStyle(person) {
  return {
    '--person-color': normalizePersonColor(person?.personColor),
    borderColor: 'rgba(40, 46, 50, 0.18)',
  }
}

function iconFadeStyle() {
  // 性别头像保留原图本身；使用 multiply 让浅色底融入人物圆圈，
  // 避免 brightness(0) 把整张 PNG 的矩形底一起变成黑框。
  return {
    opacity: 1,
    filter: 'none',
    mixBlendMode: 'multiply',
  }
}

function hslToHex(h, s, l) {
  const hue = ((Number(h) % 360) + 360) % 360
  const sat = clamp(Number(s), 0, 100) / 100
  const light = clamp(Number(l), 0, 100) / 100
  const c = (1 - Math.abs(2 * light - 1)) * sat
  const x = c * (1 - Math.abs((hue / 60) % 2 - 1))
  const m = light - c / 2
  let r = 0
  let g = 0
  let b = 0
  if (hue < 60) [r, g, b] = [c, x, 0]
  else if (hue < 120) [r, g, b] = [x, c, 0]
  else if (hue < 180) [r, g, b] = [0, c, x]
  else if (hue < 240) [r, g, b] = [0, x, c]
  else if (hue < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const toHex = value => Math.round((value + m) * 255).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function hexToRgb(hex) {
  const value = String(hex || '').replace('#', '')
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  }
}

function rgbToHex({ r, g, b }) {
  const toHex = value => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function mixRgb(a, b, t) {
  const amount = clamp(t, 0, 1)
  return {
    r: a.r + (b.r - a.r) * amount,
    g: a.g + (b.g - a.g) * amount,
    b: a.b + (b.b - a.b) * amount,
  }
}

function mixRgba(a, b, t) {
  const amount = clamp(t, 0, 1)
  return {
    r: a.r + (b.r - a.r) * amount,
    g: a.g + (b.g - a.g) * amount,
    b: a.b + (b.b - a.b) * amount,
    a: a.a + (b.a - a.a) * amount,
  }
}

function compositeOver(base, overlay) {
  const alpha = clamp(overlay.a, 0, 1)
  return {
    r: overlay.r * alpha + base.r * (1 - alpha),
    g: overlay.g * alpha + base.g * (1 - alpha),
    b: overlay.b * alpha + base.b * (1 - alpha),
  }
}

/*
  这两组 stop 与 People.css 当前真正显示的两层渐变完全一致。
  所以预览小圆圈/人物圆圈使用“屏幕上看到的颜色”，不再用另一套 HSL 估算。
*/
const PEOPLE_BOARD_HORIZONTAL_STOPS = [
  { p: 0.00, c: '#dc3434' },
  { p: 0.20, c: '#FF8C00' },
  { p: 0.40, c: '#f6df45' },
  { p: 0.60, c: '#42bc63' },
  { p: 0.80, c: '#38A7FF' },
  { p: 1.00, c: '#9b6dc4' },
]

const PEOPLE_BOARD_VERTICAL_STOPS = [
  { p: 0.00, c: { r: 255, g: 255, b: 255, a: 0.97 } },
  { p: 0.22, c: { r: 255, g: 255, b: 255, a: 0.68 } },
  { p: 0.48, c: { r: 255, g: 255, b: 255, a: 0.10 } },
  { p: 0.54, c: { r: 29,  g: 34,  b: 33,  a: 0.04 } },
  { p: 0.78, c: { r: 29,  g: 34,  b: 33,  a: 0.34 } },
  { p: 1.00, c: { r: 20,  g: 24,  b: 23,  a: 0.82 } },
]

function interpolateStops(stops, position, colorGetter, mixer) {
  const p = clamp(position, 0, 1)
  for (let index = 0; index < stops.length - 1; index += 1) {
    const left = stops[index]
    const right = stops[index + 1]
    if (p <= right.p) {
      const span = Math.max(0.0001, right.p - left.p)
      const t = (p - left.p) / span
      return mixer(colorGetter(left), colorGetter(right), t)
    }
  }
  return colorGetter(stops[stops.length - 1])
}

function colorFromBoardPoint(xRatio, yRatio) {
  const base = interpolateStops(
    PEOPLE_BOARD_HORIZONTAL_STOPS,
    xRatio,
    stop => hexToRgb(stop.c),
    mixRgb,
  )

  const overlay = interpolateStops(
    PEOPLE_BOARD_VERTICAL_STOPS,
    yRatio,
    stop => stop.c,
    mixRgba,
  )

  return rgbToHex(compositeOver(base, overlay))
}

function ImpressionColorBoard({ value, onChange }) {
  const boardRef = useRef(null)
  const draggingRef = useRef(false)

  function choose(event) {
    const board = boardRef.current
    if (!board) return
    const rect = board.getBoundingClientRect()
    const xRatio = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1)
    const yRatio = clamp((event.clientY - rect.top) / Math.max(1, rect.height), 0, 1)
    onChange(colorFromBoardPoint(xRatio, yRatio))
  }

  return (
    <div className="peopleColorPicker">
      <div
        ref={boardRef}
        className="peopleColorBoard"
        aria-label="选择人物印象颜色"
        onPointerDown={event => {
          draggingRef.current = true
          event.currentTarget.setPointerCapture?.(event.pointerId)
          choose(event)
        }}
        onPointerMove={event => {
          if (draggingRef.current) choose(event)
        }}
        onPointerUp={event => {
          draggingRef.current = false
          event.currentTarget.releasePointerCapture?.(event.pointerId)
        }}
        onPointerCancel={() => {
          draggingRef.current = false
        }}
      />
      <span className="peopleColorSelected" style={{ background: normalizePersonColor(value) }} aria-hidden="true" />
    </div>
  )
}

function relationPoint(person, angleDeg = 0) {
  const angle = angleDeg * Math.PI / 180
  const radius = distanceFromFrequency(person.frequency)
  return {
    x: clamp(50 + Math.cos(angle) * radius, 7, 93),
    y: clamp(50 + Math.sin(angle) * radius, 8, 92),
    angle,
    radius,
  }
}

function layoutGraphPeople(people, birthDate, targetMonth) {
  const byFrequency = FREQUENCY_OPTIONS.reduce((acc, frequency) => ({ ...acc, [frequency]: [] }), {})

  people.forEach(person => {
    const key = FREQUENCY_OPTIONS.includes(person.frequency) ? person.frequency : '数月'
    byFrequency[key].push(person)
  })

  return FREQUENCY_OPTIONS.flatMap((frequency, ringIndex) => {
    const group = [...(byFrequency[frequency] || [])].sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN')
    )
    const count = group.length
    if (!count) return []

    const seed = hashText(`${frequency}-${group.map(item => item.id).join('-')}`)
    const baseAngle = (seed % 360) + ringIndex * 11
    const step = 360 / count

    return group.map((person, index) => {
      const size = sizeFromTime(person, birthDate, targetMonth)
      // 同一联系频率的人默认均匀分布；用户手动轻移后，优先使用保存的圆周角度。
      const savedAngle = Number(person.manualAngle)
      const angle = Number.isFinite(savedAngle) ? savedAngle : baseAngle + index * step
      return {
        ...person,
        layoutPoint: relationPoint(person, angle),
        layoutSize: size,
      }
    })
  })
}
function genderClass(person) {
  if (person.gender === '男') return 'male'
  if (person.gender === '女') return 'female'
  return 'none'
}

function genderIcon(person) {
  if (person.gender === '男') return '/refine/icon_male.png'
  if (person.gender === '女') return '/refine/icon_female.png'
  return ''
}

function sortValue(person, key, targetMonth = currentMonthValue()) {
  if (key === 'name') return person.name || ''
  if (key === 'nickname') return person.nickname || ''
  if (key === 'group') return PEOPLE_GROUPS.indexOf(person.group)
  if (key === 'relation') return person.relation || ''
  if (key === 'gender') return person.gender || ''
  if (key === 'start') return monthIndex(person.startYear, person.startMonth) || 0
  if (key === 'end') return monthIndex(person.endYear, person.endMonth) || 999999
  if (key === 'frequency') return FREQUENCY_OPTIONS.indexOf(person.frequency)
  if (key === 'personColor') return person.personColor || ''
  if (key === 'note') return person.note || ''
  if (key === 'updatedAt') return Number(person.updatedAt || person.id || 0)
  if (key === 'monthsKnown') return monthsKnown(person, targetMonth)
  return ''
}

function normalizePerson(person) {
  return {
    ...EMPTY_PERSON,
    ...(person || {}),
    nickname: String(person?.nickname || '').trim(),
    group: person?.group === '' ? '' : (PEOPLE_GROUPS.includes(person?.group) ? person.group : '其他'),
    gender: person?.gender === '' ? '' : (PEOPLE_GENDERS.includes(person?.gender) ? person.gender : '女'),
    frequency: person?.frequency === '' ? '' : (FREQUENCY_OPTIONS.includes(person?.frequency) ? person.frequency : '数月'),
    personColor: normalizePersonColor(person?.personColor),
    witnessEntries: Array.isArray(person?.witnessEntries) ? person.witnessEntries : (person?.witnessText ? [person.witnessText] : []),
    history: Array.isArray(person?.history) ? person.history : [],
    photos: Array.isArray(person?.photos) ? person.photos : [],
  }
}

function validNickname(value) {
  const text = String(value || '').trim()
  if (!text) return false
  if (/^[A-Za-z]{1,4}$/.test(text)) return true
  return /^[\u3400-\u9fff]{1,2}$/.test(text)
}

function durationText(person, targetMonth) {
  const months = monthsKnown(person, targetMonth)
  if (months < 12) return `${months}个月`
  const years = Math.floor(months / 12)
  const rest = months % 12
  return rest ? `${years}年${rest}个月` : `${years}年`
}

function impressionPhrase(person) {
  return person?.personColor ? '由你亲自选定颜色' : '尚待补充'
}

function changedFields(before, after) {
  if (!before) return ['create']
  const checks = [
    ['end', `${before.endYear}-${before.endMonth}`, `${after.endYear}-${after.endMonth}`],
    ['frequency', before.frequency, after.frequency],
    ['color', before.personColor, after.personColor],
    ['note', before.note, after.note],
    ['start', `${before.startYear}-${before.startMonth}`, `${after.startYear}-${after.startMonth}`],
    ['relation', before.relation, after.relation],
    ['nickname', before.nickname, after.nickname],
  ]
  return checks.filter(([, oldValue, newValue]) => String(oldValue ?? '') !== String(newValue ?? '')).map(([key]) => key)
}

function buildWitnessText(before, person, savedMonth) {
  const monthText = formatMonthFull(savedMonth)
  const displayName = person.nickname || person.name
  const changes = changedFields(before, person)

  if (changes.includes('create')) {
    const relationText = person.relation ? `，是你的${person.relation}` : ''
    const startText = person.startYear ? `。这段关系始于${formatDateParts(person.startYear, person.startMonth)}，至今${durationText(person, savedMonth)}` : ''
    return `${monthText}，你记下了${displayName}${relationText}${startText}，留下了一份${impressionPhrase(person)}的印象。`.slice(0, 100)
  }
  if (changes.includes('end') && person.endYear) {
    return `${monthText}，你把${displayName}的关系停留在${formatDateParts(person.endYear, person.endMonth)}。记录仍在，人间图从此刻起不再显示这段关系。`.slice(0, 100)
  }
  if (changes.includes('frequency')) {
    return `${monthText}，你更新了与${displayName}的联系频率。人与人的距离会改变，记录也随之移动。`.slice(0, 100)
  }
  if (changes.includes('color')) {
    return `${monthText}，你重新写下了对${displayName}的印象。时间推移，记忆的颜色和清晰程度也会变化。`.slice(0, 100)
  }
  if (changes.includes('note')) {
    return `${monthText}，你补充了${displayName}的备注。这份人物记录因此更完整，也更接近此刻的真实。`.slice(0, 100)
  }
  if (changes.includes('start') || changes.includes('relation') || changes.includes('nickname')) {
    return `${monthText}，你修正了${displayName}的关系资料。雪粒已经记下这次变化。`.slice(0, 100)
  }
  return ''
}

const PEOPLE_MEDIA_DB = 'snowball-people-media-v1'
const PEOPLE_MEDIA_STORE = 'photos'
const PEOPLE_MEDIA_KEY = 'people-photo-indexes'

function openPeopleMediaDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'))
      return
    }

    const request = indexedDB.open(PEOPLE_MEDIA_DB, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(PEOPLE_MEDIA_STORE)) {
        db.createObjectStore(PEOPLE_MEDIA_STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error || new Error('People media DB open failed'))
  })
}

function loadPeopleMedia() {
  return openPeopleMediaDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(PEOPLE_MEDIA_STORE, 'readonly')
    const request = tx.objectStore(PEOPLE_MEDIA_STORE).get(PEOPLE_MEDIA_KEY)
    request.onsuccess = () =>
      resolve(request.result || { selfPhotos: [], peoplePhotos: {}, photoAlbums: {} })
    request.onerror = () =>
      reject(request.error || new Error('People media read failed'))
    tx.oncomplete = () => db.close()
  }))
}

function savePeopleMedia(selfPhotos, people, photoAlbums = {}) {
  const peoplePhotos = {}
  ;(Array.isArray(people) ? people : []).forEach(person => {
    if (Array.isArray(person?.photos) && person.photos.length) {
      peoplePhotos[String(person.id)] = person.photos
    }
  })

  const payload = {
    selfPhotos: Array.isArray(selfPhotos) ? selfPhotos : [],
    peoplePhotos,
    photoAlbums: photoAlbums && typeof photoAlbums === 'object' ? photoAlbums : {},
    savedAt: Date.now(),
  }

  return openPeopleMediaDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(PEOPLE_MEDIA_STORE, 'readwrite')
    tx.objectStore(PEOPLE_MEDIA_STORE).put(payload, PEOPLE_MEDIA_KEY)
    tx.oncomplete = () => {
      db.close()
      resolve(true)
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error || new Error('People media write failed'))
    }
  }))
}

function compressPeoplePhoto(file, index = 0) {
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
            id: `people-web-photo-${Date.now()}-${index}`,
            assetIdentifier: '',
            uri: '',
            thumbnail: source,
            source: 'web-thumbnail-only',
          })
          return
        }

        context.drawImage(image, 0, 0, width, height)
        resolve({
          id: `people-web-photo-${Date.now()}-${index}`,
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


function photoIndexIdentityKeys(photo) {
  if (!photo || typeof photo !== 'object') return []

  const keys = []
  const assetIdentifier = String(
    photo.assetIdentifier || '',
  ).trim()
  const assetKey = String(photo.assetKey || '').trim()
  const mediaStoreId = String(
    photo.mediaStoreId || '',
  ).trim()
  const uri = String(photo.uri || '').trim()

  if (assetIdentifier) {
    keys.push(`asset:${assetIdentifier}`)
  }

  if (assetKey) {
    keys.push(`stable:${assetKey}`)
  }

  if (mediaStoreId) {
    keys.push(`android-media:${mediaStoreId}`)
  }

  if (uri) {
    const normalizedUri = uri
      .replace(/[?#].*$/, '')
      .replace(/\/+$/, '')

    keys.push(`uri:${normalizedUri}`)

    let decoded = normalizedUri
    try {
      decoded = decodeURIComponent(normalizedUri)
    } catch {}

    const mediaMatch =
      decoded.match(/\/images\/media\/(\d+)$/i)
      || decoded.match(/(?:image|images\/media)[:/](\d+)/i)

    if (mediaMatch) {
      keys.push(`android-media:${mediaMatch[1]}`)
    }
  }

  // 兼容已经写入旧版本数据库、但还没有 assetKey 的照片。
  const filename = String(
    photo.filename || '',
  ).trim().toLowerCase()
  const creationDate = String(
    photo.creationDate || '',
  ).trim()
  const width = Number(photo.width || 0)
  const height = Number(photo.height || 0)

  if (filename && creationDate) {
    keys.push(
      `legacy-meta:${filename}|${creationDate}|${width}|${height}`,
    )
  }

  return [...new Set(keys)]
}

function photoIndexIdentity(photo) {
  return photoIndexIdentityKeys(photo)[0] || ''
}

function filterNewPhotoIndexes(picked, existing) {
  const seen = new Set()

  ;(Array.isArray(existing) ? existing : []).forEach(
    photo => {
      photoIndexIdentityKeys(photo).forEach(
        key => seen.add(key),
      )
    },
  )

  return (Array.isArray(picked) ? picked : []).filter(
    photo => {
      const keys = photoIndexIdentityKeys(photo)

      if (!keys.length) return true

      if (keys.some(key => seen.has(key))) {
        return false
      }

      keys.forEach(key => seen.add(key))
      return true
    },
  )
}

function formatPhotoIndexDate(value) {
  const date = new Date(value || '')
  if (Number.isNaN(date.getTime())) return ''
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}.${m}.${d}`
}

function compactPhotoDeviceName(value) {
  const text = String(value || '').trim().replace(/\s+/g, ' ')
  if (!text) return ''
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase()
}

function photoIndexMeta(photo) {
  return {
    device: compactPhotoDeviceName(photo?.sourceDevice),
    date: formatPhotoIndexDate(photo?.creationDate),
  }
}


function movePhotoItem(list, fromIndex, toIndex) {
  const next = [...(Array.isArray(list) ? list : [])]
  if (
    fromIndex < 0 || toIndex < 0
    || fromIndex >= next.length || toIndex >= next.length
    || fromIndex === toIndex
  ) return next
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return next
}

function collectPhotoScrollLocks(element) {
  const locks = []
  const seen = new Set()

  let current = element?.parentElement || null

  while (current) {
    if (!seen.has(current)) {
      const style = window.getComputedStyle(current)
      const overflowY = style.overflowY
      const canScroll =
        (overflowY === 'auto' || overflowY === 'scroll')
        && current.scrollHeight > current.clientHeight + 2

      if (canScroll) {
        locks.push({
          element: current,
          top: current.scrollTop,
          left: current.scrollLeft,
          isWindow: false,
        })
        seen.add(current)
      }
    }

    if (
      current === document.body
      || current === document.documentElement
    ) {
      break
    }

    current = current.parentElement
  }

  locks.push({
    element: window,
    top:
      window.scrollY
      || document.documentElement.scrollTop
      || document.body.scrollTop
      || 0,
    left:
      window.scrollX
      || document.documentElement.scrollLeft
      || document.body.scrollLeft
      || 0,
    isWindow: true,
  })

  return locks
}

function restorePhotoDragScroll(drag) {
  const state = drag?.scrollState
  if (!state?.locks?.length || state.restoring) return

  state.restoring = true

  try {
    state.locks.forEach(lock => {
      if (lock.isWindow) {
        window.scrollTo(lock.left, lock.top)
      } else if (lock.element) {
        if (lock.element.scrollTop !== lock.top) {
          lock.element.scrollTop = lock.top
        }
        if (lock.element.scrollLeft !== lock.left) {
          lock.element.scrollLeft = lock.left
        }
      }
    })
  } finally {
    state.restoring = false
  }
}

function lockPhotoDragScroll(drag) {
  if (!drag || drag.scrollState) return

  const scrollState = {
    locks: collectPhotoScrollLocks(drag.sourceEl),
    restoring: false,
    onScroll: null,
    raf1: 0,
    raf2: 0,
  }

  drag.scrollState = scrollState

  scrollState.onScroll = () => {
    if (drag.scrollState === scrollState) {
      restorePhotoDragScroll(drag)
    }
  }

  // scroll 不冒泡，但 capture 可以捕获元素滚动。
  // 同时监听 window，确保 WebView 视口滚动也被锁住。
  document.addEventListener(
    'scroll',
    scrollState.onScroll,
    true,
  )
  window.addEventListener(
    'scroll',
    scrollState.onScroll,
    true,
  )

  restorePhotoDragScroll(drag)

  // Android WebView 可能在长按成立前已经积累了少量滚动惯性。
  // 两帧内再次恢复固定位置，直接截断这段惯性。
  scrollState.raf1 = window.requestAnimationFrame(() => {
    restorePhotoDragScroll(drag)
    scrollState.raf2 = window.requestAnimationFrame(() => {
      restorePhotoDragScroll(drag)
    })
  })
}

function unlockPhotoDragScroll(drag) {
  const state = drag?.scrollState
  if (!state) return

  drag.scrollState = null

  if (state.onScroll) {
    document.removeEventListener(
      'scroll',
      state.onScroll,
      true,
    )
    window.removeEventListener(
      'scroll',
      state.onScroll,
      true,
    )
  }

  if (state.raf1) {
    window.cancelAnimationFrame(state.raf1)
  }
  if (state.raf2) {
    window.cancelAnimationFrame(state.raf2)
  }
}

function holdPhotoDragScroll(drag) {
  // 拖动期间只做一件事：把所有可滚动层恢复到拖动开始时的位置。
  // 不做边缘自动滚动，不改变 overflow / touch-action。
  restorePhotoDragScroll(drag)
}

function createPhotoDragGhost(
  thumbnail,
  rect,
  x,
  y,
) {
  const ghost = document.createElement('div')
  ghost.className = 'snowballPhotoDragGhost'
  ghost.style.width =
    `${Math.max(56, rect?.width || 72)}px`
  ghost.style.height =
    `${Math.max(56, rect?.height || 72)}px`

  const image = document.createElement('img')
  image.src = thumbnail || ''
  image.alt = ''
  ghost.appendChild(image)

  document.body.appendChild(ghost)
  movePhotoDragGhost(ghost, x, y)
  return ghost
}

function movePhotoDragGhost(ghost, x, y) {
  if (!ghost) return

  ghost.style.transform =
    `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0) `
    + 'translate(-50%, -50%)'
}

function removePhotoDragGhost(ghost) {
  try {
    ghost?.remove?.()
  } catch {}
}

export default function People({ people = [], setData, onClose, birthDate = '', selfPhotos = [] }) {
  const [groupFilter, setGroupFilter] = useState('全部')
  const [tableGroupFilter, setTableGroupFilter] = useState('全部')
  const [sortKey, setSortKey] = useState('updatedAt')
  const [sortDirection, setSortDirection] = useState('desc')
  const [editing, setEditing] = useState(null)
  const [draft, setDraft] = useState(EMPTY_PERSON)
  const [showBirthdayEditor, setShowBirthdayEditor] = useState(false)
  const initialBirthdayParts = monthPartsFromValue(normalizeMonthOnly(birthDate))
  const [birthdayYearDraft, setBirthdayYearDraft] = useState(initialBirthdayParts.year || '')
  const [birthdayMonthDraft, setBirthdayMonthDraft] = useState(initialBirthdayParts.month || '')
  const [mapMonthMode, setMapMonthMode] = useState('today')
  const [customMapMonth, setCustomMapMonth] = useState(currentMonthValue())
  const [customMonthPickerOpen, setCustomMonthPickerOpen] = useState(false)
  const [testTodayMonth, setTestTodayMonth] = useState('')
  const [testTodayDraft, setTestTodayDraft] = useState(monthChineseDraft(currentMonthValue()))
  const [testTodayUnlocked, setTestTodayUnlocked] = useState(false)

  function unlockTestToday(event) {
    if (testTodayUnlocked) return true
    event?.preventDefault?.()
    event?.stopPropagation?.()
    event?.currentTarget?.blur?.()

    const password = window.prompt('请输入测试密码')
    if (password === TEST_PASSWORD) {
      setTestTodayUnlocked(true)
      return true
    }

    if (password !== null) window.alert('密码不正确')
    return false
  }
  const [nicknameError, setNicknameError] = useState('')
  const [expandedWitnessId, setExpandedWitnessId] = useState(null)
  const [showPeopleInfo, setShowPeopleInfo] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [photoTarget, setPhotoTarget] = useState(null)
  const [photoEditing, setPhotoEditing] = useState(false)
  const [photoDraft, setPhotoDraft] = useState([])
  const [photoAlbums, setPhotoAlbums] = useState({})
  const [photoAlbumDraft, setPhotoAlbumDraft] = useState([])
  const [selectedPhotoAlbumId, setSelectedPhotoAlbumId] = useState('')
  const [photoAlbumWindowStart, setPhotoAlbumWindowStart] = useState(0)
  const [newPhotoAlbumId, setNewPhotoAlbumId] = useState('')
  const [peopleMediaReady, setPeopleMediaReady] = useState(false)
  const [dragAngles, setDragAngles] = useState({})
  const mapCanvasRef = useRef(null)
  const dragRef = useRef(null)
  const suppressClickRef = useRef({ id: null, until: 0 })
  const photoDragRef = useRef(null)
  const photoDragTimerRef = useRef(null)
  const [photoDragActive, setPhotoDragActive] = useState(false)

  const activeBirthDate = normalizeMonthOnly(
    birthDate || (
      birthdayYearDraft && birthdayMonthDraft
        ? `${birthdayYearDraft}/${birthdayMonthDraft}`
        : ''
    )
  )
  const activeTodayMonth = testTodayMonth || currentMonthValue()
  const selectedPreset = HISTORY_PRESETS.find(item => item.key === mapMonthMode)
  const activeMapMonth = mapMonthMode === 'custom'
    ? (customMapMonth || activeTodayMonth)
    : addMonthsToValue(activeTodayMonth, selectedPreset?.months || 0)
  const selfSize = selfSizeFromBirth(activeBirthDate, activeMapMonth)

  const normalizedPeople = useMemo(() => people.map(normalizePerson), [people])

  const tablePeople = useMemo(() => {
    const filtered = tableGroupFilter === '全部'
      ? normalizedPeople
      : normalizedPeople.filter(person => person.group === tableGroupFilter)

    return [...filtered].sort((a, b) => {
      const av = sortValue(a, sortKey, activeMapMonth)
      const bv = sortValue(b, sortKey, activeMapMonth)
      let result = 0
      if (typeof av === 'number' && typeof bv === 'number') result = av - bv
      else result = String(av).localeCompare(String(bv), 'zh-CN')
      return sortDirection === 'asc' ? result : -result
    })
  }, [activeMapMonth, normalizedPeople, sortDirection, sortKey, tableGroupFilter])

  const graphPeople = useMemo(() => {
    const inGroup = groupFilter === '全部'
      ? normalizedPeople
      : normalizedPeople.filter(person => person.group === groupFilter)

    return inGroup
      .map(person => snapshotForMonth(person, activeMapMonth))
      .filter(person => relationExistsAt(person, activeMapMonth))
  }, [activeMapMonth, groupFilter, normalizedPeople])

  const graphLayoutPeople = useMemo(
    () => activeBirthDate ? layoutGraphPeople(graphPeople, activeBirthDate, activeMapMonth) : [],
    [activeBirthDate, activeMapMonth, graphPeople],
  )

  useEffect(() => {
    let alive = true

    loadPeopleMedia()
      .then(media => {
        if (!alive) return

        const restoredSelf = Array.isArray(media?.selfPhotos)
          ? media.selfPhotos
          : []
        const peoplePhotos =
          media?.peoplePhotos && typeof media.peoplePhotos === 'object'
            ? media.peoplePhotos
            : {}
        const restoredPhotoAlbums =
          media?.photoAlbums && typeof media.photoAlbums === 'object'
            ? media.photoAlbums
            : {}

        setPhotoAlbums(restoredPhotoAlbums)

        setData(prev => ({
          ...prev,
          peopleSelfPhotos: restoredSelf,
          people: (prev.people || []).map(person => ({
            ...person,
            photos: Array.isArray(peoplePhotos[String(person.id)])
              ? peoplePhotos[String(person.id)]
              : [],
          })),
          lastSavedAt: Date.now(),
        }))
      })
      .catch(error => {
        console.warn('人间照片索引读取失败。', error)
      })
      .finally(() => {
        if (alive) setPeopleMediaReady(true)
      })

    return () => {
      alive = false
    }
  }, [setData])

  useEffect(() => {
    if (!peopleMediaReady) return
    savePeopleMedia(selfPhotos, people, photoAlbums)
      .catch(error => {
        console.warn('人间照片索引保存失败。', error)
      })
  }, [peopleMediaReady, people, photoAlbums, selfPhotos])

  function photoTargetKey(target = photoTarget) {
    if (!target) return ''
    return target.kind === 'self' ? 'self' : String(target.id)
  }

  function albumsForTarget(target = photoTarget) {
    const key = photoTargetKey(target)
    const albums = key ? photoAlbums[key] : []
    return Array.isArray(albums) ? albums : []
  }

  function photosForTarget(target = photoTarget) {
    if (!target) return []
    if (target.kind === 'self') {
      return Array.isArray(selfPhotos) ? selfPhotos : []
    }

    const person = normalizedPeople.find(
      item => String(item.id) === String(target.id),
    )
    return Array.isArray(person?.photos) ? person.photos : []
  }

  function photosForSelectedAlbum(sourcePhotos = photosForTarget()) {
    const photos = Array.isArray(sourcePhotos) ? sourcePhotos : []

    // 默认主页就是“未分类”：已经归入分册的照片不再重复显示。
    if (!selectedPhotoAlbumId) {
      return photos.filter(photo => !String(photo?.albumId || '').trim())
    }

    return photos.filter(
      photo => String(photo?.albumId || '') === String(selectedPhotoAlbumId),
    )
  }

  function selectPhotoAlbum(albumId) {
    const nextId = String(albumId || '')

    setSelectedPhotoAlbumId(prev => {
      const currentId = String(prev || '')
      return currentId === nextId ? '' : nextId
    })
  }

  function openPhotoArea(target) {
    const photos = target.kind === 'self'
      ? (Array.isArray(selfPhotos) ? selfPhotos : [])
      : (
          normalizedPeople.find(
            item => String(item.id) === String(target.id),
          )?.photos || []
        )
    const albums = albumsForTarget(target)

    setPhotoTarget(target)
    setPhotoDraft([...photos])
    setPhotoAlbumDraft(albums.map(album => ({ ...album })))
    setSelectedPhotoAlbumId('')
    setPhotoAlbumWindowStart(0)
    setNewPhotoAlbumId('')
    setPhotoEditing(false)
  }

  function closePhotoArea() {
    setPhotoTarget(null)
    setPhotoDraft([])
    setPhotoAlbumDraft([])
    setSelectedPhotoAlbumId('')
    setPhotoAlbumWindowStart(0)
    setNewPhotoAlbumId('')
    setPhotoEditing(false)
  }

  function peoplePhotoGlobalIndex(photo) {
    return photoDraft.findIndex(
      item =>
        item === photo
        || (
          photoIndexIdentity(item)
          && photoIndexIdentity(item)
            === photoIndexIdentity(photo)
        ),
    )
  }

  function clearPeoplePhotoDragTimer() {
    if (photoDragTimerRef.current) {
      window.clearTimeout(photoDragTimerRef.current)
      photoDragTimerRef.current = null
    }
  }

  function detachPeoplePhotoDragListeners() {
    const drag = photoDragRef.current
    if (!drag?.listeners) return

    window.removeEventListener(
      'touchmove',
      drag.listeners.move,
      true,
    )
    window.removeEventListener(
      'touchend',
      drag.listeners.end,
      true,
    )
    window.removeEventListener(
      'touchcancel',
      drag.listeners.cancel,
      true,
    )
    drag.listeners = null
  }

  function cleanupPeoplePhotoDrag() {
    clearPeoplePhotoDragTimer()

    const drag = photoDragRef.current
    photoDragRef.current = null

    try {
      unlockPhotoDragScroll(drag)
      drag?.sourceEl?.classList?.remove(
        'photoDragSource',
      )
      removePhotoDragGhost(drag?.ghost)

      if (drag?.listeners) {
        window.removeEventListener('touchmove', drag.listeners.move, true)
        window.removeEventListener('touchend', drag.listeners.end, true)
        window.removeEventListener('touchcancel', drag.listeners.cancel, true)
      }
    } finally {
      setPhotoDragActive(false)
    }
  }

  function beginPeoplePhotoTouch(event, photo) {
    if (!photoEditing || event.touches.length !== 1) {
      return
    }

    if (
      event.target?.closest?.('.peoplePhotoDelete')
    ) {
      return
    }

    cleanupPeoplePhotoDrag()

    const touch = event.touches[0]
    const index = peoplePhotoGlobalIndex(photo)
    if (index < 0) return

    const drag = {
      active: false,
      touchId: touch.identifier,
      photo,
      index,
      startX: touch.clientX,
      startY: touch.clientY,
      lastX: touch.clientX,
      lastY: touch.clientY,
      sourceEl: event.currentTarget,
      ghost: null,
      listeners: null,
    }

    const onMove = nativeEvent => {
      const current = photoDragRef.current
      if (!current) return

      const movingTouch = Array.from(
        nativeEvent.touches || [],
      ).find(
        item => item.identifier === current.touchId,
      )

      if (!movingTouch) return

      current.lastX = movingTouch.clientX
      current.lastY = movingTouch.clientY

      if (!current.active) {
        const dx =
          movingTouch.clientX - current.startX
        const dy =
          movingTouch.clientY - current.startY

        if (Math.hypot(dx, dy) > 9) {
          cleanupPeoplePhotoDrag()
        }
        return
      }

      nativeEvent.preventDefault()
      nativeEvent.stopPropagation()

      movePhotoDragGhost(
        current.ghost,
        movingTouch.clientX,
        movingTouch.clientY,
      )

      holdPhotoDragScroll(current)

      const pointTarget = document.elementFromPoint(
        movingTouch.clientX,
        movingTouch.clientY,
      )

      const targetItem =
        pointTarget?.closest?.('.peoplePhotoItem')

      let to = Number(
        targetItem?.dataset?.photoGlobalIndex,
      )

      if (
        !Number.isInteger(to)
        && pointTarget?.closest?.('.peoplePhotoGrid')
      ) {
        const visible = photosForSelectedAlbum(
          photoDraft,
        )
        const lastVisible =
          visible[visible.length - 1]

        to = peoplePhotoGlobalIndex(lastVisible)
      }

      if (
        !Number.isInteger(to)
        || to < 0
        || to === current.index
      ) {
        return
      }

      setPhotoDraft(prev => {
        const from = prev.findIndex(
          item =>
            item === current.photo
            || (
              photoIndexIdentity(item)
              && photoIndexIdentity(item)
                === photoIndexIdentity(
                  current.photo,
                )
            ),
        )

        if (
          from < 0
          || to >= prev.length
          || from === to
        ) {
          return prev
        }

        current.index = to
        return movePhotoItem(prev, from, to)
      })
    }

    const finish = (
      nativeEvent,
      cancelled = false,
    ) => {
      const current = photoDragRef.current
      if (!current) return

      const changedTouch = Array.from(
        nativeEvent.changedTouches || [],
      ).find(
        item => item.identifier === current.touchId,
      )

      if (
        current.active
        && changedTouch
        && !cancelled
      ) {
        nativeEvent.preventDefault()
        nativeEvent.stopPropagation()

        const target = document.elementFromPoint(
          changedTouch.clientX,
          changedTouch.clientY,
        )

        const albumCapsule =
          target?.closest?.(
            '.peoplePhotoAlbumCapsule',
          )
        const targetPhoto =
          target?.closest?.('.peoplePhotoItem')
        const albumId =
          albumCapsule?.dataset?.albumId

        if (albumCapsule && albumId) {
          setPhotoDraft(prev =>
            prev.map(item => {
              const same =
                item === current.photo
                || (
                  photoIndexIdentity(item)
                  && photoIndexIdentity(item)
                    === photoIndexIdentity(
                      current.photo,
                    )
                )

              return same
                ? { ...item, albumId }
                : item
            }),
          )

          setSelectedPhotoAlbumId(albumId)
        } else if (!targetPhoto) {
          // 松手在照片网格外、也不在任何胶囊上：
          // 视为拖出分册，回到未分类。
          setPhotoDraft(prev =>
            prev.map(item => {
              const same =
                item === current.photo
                || (
                  photoIndexIdentity(item)
                  && photoIndexIdentity(item)
                    === photoIndexIdentity(
                      current.photo,
                    )
                )

              return same
                ? { ...item, albumId: '' }
                : item
            }),
          )

          setSelectedPhotoAlbumId('')
        }
      }

      cleanupPeoplePhotoDrag()
    }

    drag.listeners = {
      move: onMove,
      end: nativeEvent =>
        finish(nativeEvent, false),
      cancel: nativeEvent =>
        finish(nativeEvent, true),
    }

    photoDragRef.current = drag

    window.addEventListener(
      'touchmove',
      drag.listeners.move,
      {
        capture: true,
        passive: false,
      },
    )
    window.addEventListener(
      'touchend',
      drag.listeners.end,
      {
        capture: true,
        passive: false,
      },
    )
    window.addEventListener(
      'touchcancel',
      drag.listeners.cancel,
      {
        capture: true,
        passive: false,
      },
    )

    photoDragTimerRef.current =
      window.setTimeout(() => {
        const current = photoDragRef.current
        if (
          !current
          || current.touchId !== touch.identifier
        ) {
          return
        }

        current.active = true
        lockPhotoDragScroll(current)
        current.sourceEl?.classList?.add(
          'photoDragSource',
        )

        current.ghost = createPhotoDragGhost(
          current.photo?.thumbnail,
          current.sourceEl
            ?.getBoundingClientRect?.(),
          current.lastX,
          current.lastY,
        )

        setPhotoDragActive(true)
      }, 320)
  }

  function beginPhotoEdit() {
    setPhotoDraft([...photosForTarget()])
    setPhotoAlbumDraft(albumsForTarget().map(album => ({ ...album })))
    setNewPhotoAlbumId('')
    setPhotoEditing(true)
  }

  function cancelPhotoEdit() {
    setPhotoDraft([...photosForTarget()])
    setPhotoAlbumDraft(albumsForTarget().map(album => ({ ...album })))
    if (
      selectedPhotoAlbumId
      && !albumsForTarget().some(album => String(album.id) === String(selectedPhotoAlbumId))
    ) {
      setSelectedPhotoAlbumId('')
    }
    setNewPhotoAlbumId('')
    setPhotoEditing(false)
  }

  function commitPhotos(nextPhotos) {
    const safePhotos = Array.isArray(nextPhotos) ? nextPhotos : []

    setData(prev => {
      if (photoTarget?.kind === 'self') {
        return {
          ...prev,
          peopleSelfPhotos: safePhotos,
          lastSavedAt: Date.now(),
        }
      }

      return {
        ...prev,
        people: (prev.people || []).map(person =>
          String(person.id) === String(photoTarget?.id)
            ? { ...person, photos: safePhotos, updatedAt: Date.now() }
            : person,
        ),
        lastSavedAt: Date.now(),
      }
    })
  }

  function commitPhotoAlbums(nextAlbums) {
    const key = photoTargetKey()
    if (!key) return

    const safeAlbums = (Array.isArray(nextAlbums) ? nextAlbums : [])
      .map(album => ({
        id: String(album?.id || ''),
        title: String(album?.title || '').trim(),
      }))
      .filter(album => album.id)

    setPhotoAlbums(prev => ({
      ...(prev || {}),
      [key]: safeAlbums,
    }))
  }

  function savePhotoEdit() {
    commitPhotos(photoDraft)
    commitPhotoAlbums(photoAlbumDraft)

    if (
      selectedPhotoAlbumId
      && !photoAlbumDraft.some(album => String(album.id) === String(selectedPhotoAlbumId))
    ) {
      setSelectedPhotoAlbumId('')
    }

    setNewPhotoAlbumId('')
    setPhotoEditing(false)
  }

  function addPhotoAlbum() {
    const id = `people-album-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setPhotoAlbumDraft(prev => [...prev, { id, title: '' }])
    setSelectedPhotoAlbumId(id)
    setNewPhotoAlbumId(id)

    setPhotoAlbumWindowStart(prev => {
      const nextLength = photoAlbumDraft.length + 1
      return nextLength > 4 ? Math.max(0, nextLength - 4) : prev
    })
  }

  function renamePhotoAlbum(albumId, title) {
    setPhotoAlbumDraft(prev =>
      prev.map(album =>
        String(album.id) === String(albumId)
          ? { ...album, title }
          : album,
      ),
    )
  }

  function deletePhotoAlbum(albumId) {
    const key = photoTargetKey()
    const nextAlbums = photoAlbumDraft.filter(
      album => String(album.id) !== String(albumId),
    )
    const nextPhotos = photoDraft.map(photo =>
      String(photo?.albumId || '') === String(albumId)
        ? { ...photo, albumId: '' }
        : photo,
    )

    // 分册删除立即生效：只删除雪球里的“目录关系”，不删除任何照片索引。
    setPhotoAlbumDraft(nextAlbums)
    setPhotoDraft(nextPhotos)

    if (key) {
      setPhotoAlbums(prev => ({
        ...(prev || {}),
        [key]: nextAlbums.map(album => ({
          id: String(album?.id || ''),
          title: String(album?.title || '').trim(),
        })),
      }))
    }
    commitPhotos(nextPhotos)

    if (String(selectedPhotoAlbumId) === String(albumId)) {
      setSelectedPhotoAlbumId('')
    }
    if (String(newPhotoAlbumId) === String(albumId)) {
      setNewPhotoAlbumId('')
    }

    setPhotoAlbumWindowStart(prev =>
      Math.min(
        Math.max(0, nextAlbums.length - 4),
        Math.max(0, prev),
      ),
    )
  }

  async function pickPeoplePhotos(files = null) {
    try {
      let picked = []

      if (isPhotoIndexAvailable()) {
        picked = await pickPhotoIndexes()
      } else {
        const fileList = Array.from(files || [])
        picked = (
          await Promise.all(
            fileList.map((file, index) =>
              compressPeoplePhoto(file, index),
            ),
          )
        ).filter(Boolean)
      }

      if (!picked.length) return

      // 同一人物记录内，主册 + 全部分册共用一个去重池。
      // 其它人物记录仍允许使用同一张系统照片。
      const existingForRecord = photoEditing
        ? photoDraft
        : photosForTarget()
      const uniquePicked = filterNewPhotoIndexes(
        picked,
        existingForRecord,
      )
      if (!uniquePicked.length) return

      const assigned = uniquePicked.map(photo => ({
        ...photo,
        albumId: selectedPhotoAlbumId || '',
      }))

      if (photoEditing) {
        setPhotoDraft(prev => [...prev, ...assigned])
      } else {
        const nextPhotos = [...photosForTarget(), ...assigned]
        commitPhotos(nextPhotos)
        setPhotoDraft(nextPhotos)
      }
    } catch (error) {
      window.alert(
        String(error?.message || error || '照片没有保存成功，请稍后再试。'),
      )
    }
  }

  function removePhotoDraft(photoToRemove) {
    const targetKeys =
      photoIndexIdentityKeys(photoToRemove)

    setPhotoDraft(prev => {
      let removed = false

      return prev.filter(photo => {
        if (removed) return true

        const sameObject = photo === photoToRemove
        const photoKeys = photoIndexIdentityKeys(photo)
        const sameIdentity =
          targetKeys.length > 0
          && photoKeys.some(key =>
            targetKeys.includes(key),
          )

        if (sameObject || sameIdentity) {
          removed = true
          return false
        }

        return true
      })
    })
  }

  async function openPeoplePhoto(photo, photos, index) {
    if (!photo) return

    if (isPhotoIndexAvailable() && (photo.assetIdentifier || photo.uri)) {
      try {
        await presentIndexedPhoto(photo, photos, index)
      } catch (error) {
        window.alert(
          String(
            error?.message
              || error
              || '原照片可能已被删除，或相册访问权限已经改变。',
          ),
        )
      }
    }
  }

  function openAdd() {
    setEditing('new')
    setNicknameError('')
    setDraft({ ...EMPTY_PERSON, id: null })
  }

  function openEdit(person) {
    setNicknameError('')
    setEditing(person.id)
    setDraft(normalizePerson(person))
  }

  function closeEditor() {
    setEditing(null)
    setNicknameError('')
    setDraft(EMPTY_PERSON)
  }

  function updateDraft(field, value) {
    setDraft(prev => ({ ...prev, [field]: value }))
  }

  function savePerson() {
    const name = String(draft.name || '').trim()
    const nickname = String(draft.nickname || '').trim()
    if (!name) return
    if (!validNickname(nickname)) {
      setNicknameError('昵称必填：限2个汉字或4个英文字母。')
      return
    }

    const savedMonth = activeTodayMonth
    const nowIso = new Date().toISOString()
    const oldPerson = normalizedPeople.find(person => person.id === draft.id) || null
    const baseItem = {
      ...normalizePerson(draft),
      name,
      nickname,
      relation: String(draft.relation || '').trim(),
      note: String(draft.note || '').trim(),
      id: draft.id || Date.now(),
      updatedAt: Date.now(),
    }
    const witnessText = buildWitnessText(oldPerson, baseItem, savedMonth)
    const oldWitnessEntries = Array.isArray(baseItem.witnessEntries) ? baseItem.witnessEntries : []
    const canAddWitness = Boolean(witnessText) && oldWitnessEntries.length < 3
    const snapshot = snapshotOf(baseItem)
    const oldHistory = Array.isArray(baseItem.history) ? baseItem.history : []
    const historyWithoutMonth = oldHistory.filter(item => item.savedMonth !== savedMonth)
    const item = {
      ...baseItem,
      witnessEntries: canAddWitness ? [...oldWitnessEntries, witnessText] : oldWitnessEntries,
      history: [
        ...historyWithoutMonth,
        { savedMonth, savedAt: nowIso, snapshot },
      ].sort((a, b) => (monthValueToIndex(a.savedMonth) || 0) - (monthValueToIndex(b.savedMonth) || 0)),
    }

    setData(prev => {
      const oldPeople = Array.isArray(prev.people) ? prev.people : []
      const exists = oldPeople.some(person => person.id === item.id)
      return {
        ...prev,
        people: exists
          ? oldPeople.map(person => person.id === item.id ? item : person)
          : [item, ...oldPeople],
        lastSavedAt: Date.now(),
      }
    })
    closeEditor()
    if (!activeBirthDate) window.alert('人物记录已保存。请在“设置”中填写初始年月后再生成人间图。')
  }

  function requestDelete(person) {
    setDeleteTarget(person)
  }

  function confirmDelete() {
    if (!deleteTarget?.id) return
    setData(prev => ({
      ...prev,
      people: (prev.people || []).filter(person => person.id !== deleteTarget.id),
      lastSavedAt: Date.now(),
    }))
    setDeleteTarget(null)
  }

  function saveBirthday() {
    const year = String(birthdayYearDraft || '').replace(/[^0-9]/g, '').slice(0, 4)
    const monthNumber = Number(String(birthdayMonthDraft || '').replace(/[^0-9]/g, '').slice(0, 2))
    const month = monthNumber >= 1 && monthNumber <= 12 ? pad2(monthNumber) : ''
    const normalizedBirthday = normalizeMonthOnly(year && month ? `${year}/${month}` : '')

    if (!normalizedBirthday) {
      window.alert('请分别填写四位年份和1—12月。')
      return
    }

    const nextTestTodayMonth = testTodayUnlocked ? normalizeMonthOnly(testTodayDraft) : ''

    setBirthdayYearDraft(year)
    setBirthdayMonthDraft(month)
    setTestTodayMonth(nextTestTodayMonth)
    setTestTodayDraft(monthChineseDraft(nextTestTodayMonth || currentMonthValue()))
    setData(prev => ({
      ...prev,
      peopleBirthDate: normalizedBirthday,
      lastSavedAt: Date.now(),
    }))
    setShowBirthdayEditor(false)
  }

  function toggleSort(key) {
    if (!key || key === 'actions') return
    if (sortKey === key) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
      return
    }
    setSortKey(key)
    setSortDirection(key === 'name' || key === 'group' || key === 'relation' || key === 'gender' || key === 'note' ? 'asc' : 'desc')
  }

  function setPresetMonth(mode) {
    if (mode === 'custom') {
      if (!customMapMonth) setCustomMapMonth(activeTodayMonth)
      setCustomMonthPickerOpen(true)
      return
    }
    setMapMonthMode(mode)
    setCustomMonthPickerOpen(false)
  }

  function confirmCustomMonth() {
    if (!customMapMonth) return
    setMapMonthMode('custom')
    setCustomMonthPickerOpen(false)
  }

  function angleFromPointer(clientX, clientY) {
    const canvas = mapCanvasRef.current
    if (!canvas) return 0
    const rect = canvas.getBoundingClientRect()
    const dx = (clientX - (rect.left + rect.width / 2)) / Math.max(1, rect.width / 2)
    const dy = (clientY - (rect.top + rect.height / 2)) / Math.max(1, rect.height / 2)
    return Math.atan2(dy, dx) * 180 / Math.PI
  }

  function beginPersonDrag(event, person) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    const currentAngle = Number.isFinite(Number(person.manualAngle))
      ? Number(person.manualAngle)
      : ((person.layoutPoint?.angle || 0) * 180 / Math.PI)

    dragRef.current = {
      id: person.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      angle: currentAngle,
    }
    setDragAngles(prev => ({ ...prev, [person.id]: currentAngle }))
  }

  function movePersonOnRing(event, person) {
    const drag = dragRef.current
    if (!drag || drag.id !== person.id || drag.pointerId !== event.pointerId) return
    event.preventDefault()

    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 3) {
      drag.moved = true
    }

    const angle = angleFromPointer(event.clientX, event.clientY)
    drag.angle = angle
    setDragAngles(prev => ({ ...prev, [person.id]: angle }))
  }

  function finishPersonDrag(event, person) {
    const drag = dragRef.current
    if (!drag || drag.id !== person.id || drag.pointerId !== event.pointerId) return

    event.currentTarget.releasePointerCapture?.(event.pointerId)
    dragRef.current = null

    if (!drag.moved) {
      setDragAngles(prev => {
        const next = { ...prev }
        delete next[person.id]
        return next
      })
      return
    }

    suppressClickRef.current = { id: person.id, until: Date.now() + 350 }
    const savedAngle = Math.round(drag.angle * 10) / 10

    setDragAngles(prev => ({ ...prev, [person.id]: savedAngle }))
    setData(prev => ({
      ...prev,
      people: (prev.people || []).map(item =>
        item.id === person.id ? { ...item, manualAngle: savedAngle } : item
      ),
      lastSavedAt: Date.now(),
    }))
  }

  function cancelPersonDrag(event, person) {
    const drag = dragRef.current
    if (!drag || drag.id !== person.id) return
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    dragRef.current = null
    setDragAngles(prev => {
      const next = { ...prev }
      delete next[person.id]
      return next
    })
  }

  function handlePersonClick(person) {
    const suppressed = suppressClickRef.current
    if (suppressed.id === person.id && Date.now() < suppressed.until) return
    openPhotoArea({
      kind: 'person',
      id: person.id,
      name: person.name || person.nickname || '人物',
    })
  }

  return (
    <div className="peopleOverlay">
      <section className="peoplePanel">
        <header className="peopleTopBar">
          <button className="peopleBackBtn" type="button" onClick={onClose} aria-label="返回">‹</button>
          <div className="peopleTitleBlock">
            <h2>人际简图</h2>
            <p></p>
          </div>
          <button className="peopleInfoBtn" type="button" onClick={() => setShowPeopleInfo(true)}>说明</button>
        </header>

        <div className="peopleMapCard">
          <div className="peopleMapControls">
            <div className="peopleMapLeftControls">
              <select value={groupFilter} onChange={event => setGroupFilter(event.target.value)} aria-label="按组别筛选">
                {['全部', ...PEOPLE_GROUPS].map(group => <option key={group}>{group}</option>)}
              </select>
              <span>{graphPeople.length} 人</span>
            </div>
            <div className="peopleMapRightControls">
              <select value={mapMonthMode === 'custom' ? 'custom' : mapMonthMode} onChange={event => setPresetMonth(event.target.value)} aria-label="历史时间节点">
                {HISTORY_PRESETS.map(item => (
                  <option key={item.key} value={item.key}>{item.label}</option>
                ))}
                <option value="custom">自定</option>
              </select>
              <span className="peopleMapMonthLabel">{formatMonthFull(activeMapMonth)}</span>
              {customMonthPickerOpen && (
                <div className="peopleChineseMonthPicker" role="dialog" aria-label="选择年月">
                  <select
                    value={monthPartsFromValue(customMapMonth).year}
                    onChange={event => {
                      const month = monthPartsFromValue(customMapMonth).month || '01'
                      setCustomMapMonth(`${event.target.value}-${pad2(month)}`)
                    }}
                    aria-label="选择年份"
                  >
                    {Array.from({ length: 161 }, (_, index) => Number(monthPartsFromValue(activeTodayMonth).year) - 100 + index).map(year => (
                      <option key={year} value={year}>{year}年</option>
                    ))}
                  </select>
                  <select
                    value={monthPartsFromValue(customMapMonth).month || '01'}
                    onChange={event => {
                      const year = monthPartsFromValue(customMapMonth).year || monthPartsFromValue(activeTodayMonth).year
                      setCustomMapMonth(`${year}-${pad2(event.target.value)}`)
                    }}
                    aria-label="选择月份"
                  >
                    {Array.from({ length: 12 }, (_, index) => index + 1).map(month => (
                      <option key={month} value={pad2(month)}>{month}月</option>
                    ))}
                  </select>
                  <button type="button" onClick={confirmCustomMonth}>确定</button>
                </div>
              )}
            </div>
          </div>
          <div className="peopleMapCanvas" ref={mapCanvasRef}>
          <div className="peopleGraphLayer"></div>
            <img className="peopleWitnessCat" src="/refine/people_background_cat.png" alt="雪粒在见证人间" />
            {!activeBirthDate && <div className="peopleInitialDatePrompt">请在设置中填写初始年月，新增人物资料后，人际关系图将自动生成。</div>}
            {activeBirthDate && RING_LABELS.map(ring => (
              <div
                key={ring.key}
                className={`peopleRing peopleRing-${ring.key === 'self' ? 'selfLine' : 'frequency'}`}
                style={{ width: `${ring.radius * 2}%`, height: `${ring.radius * 2}%` }}
                aria-hidden="true"
              />
            ))}
            {activeBirthDate && <button type="button" className="peopleSelf" style={{ width: `${selfSize}px`, height: `${selfSize}px`, marginLeft: `${-selfSize / 2}px`, marginTop: `${-selfSize / 2}px` }} onClick={() => openPhotoArea({ kind: 'self', id: 'self', name: '我' })}>我</button>}
            {activeBirthDate && graphLayoutPeople.map(person => {
              const liveAngle = dragAngles[person.id]
              const point = Number.isFinite(liveAngle)
                ? relationPoint(person, liveAngle)
                : (person.layoutPoint || relationPoint(person))
              const size = person.layoutSize || sizeFromTime(person, activeBirthDate, activeMapMonth)
              const icon = genderIcon(person)
              return (
                <button
                  type="button"
                  key={person.id}
                  className={`personDot gender-${genderClass(person)} ${Number.isFinite(liveAngle) ? 'isDragging' : ''}`}
                  style={{ left: `${point.x}%`, top: `${point.y}%`, width: `${size}px`, height: `${size}px`, ...dotColorStyle(person) }}
                  title={`${person.name}｜${person.group}｜${person.relation || '关系未填'}｜${person.frequency}`}
                  onPointerDown={event => beginPersonDrag(event, person)}
                  onPointerMove={event => movePersonOnRing(event, person)}
                  onPointerUp={event => finishPersonDrag(event, person)}
                  onPointerCancel={event => cancelPersonDrag(event, person)}
                  onClick={() => handlePersonClick(person)}
                >
                  {icon ? <img src={icon} style={iconFadeStyle(person)} alt="" aria-hidden="true" /> : <span aria-hidden="true" />}
                  <em>{person.nickname || person.name}</em>
                </button>
              )
            })}
          </div>
        </div>

        <div className="peopleTableCard">
          <div className="peopleTableScroll">
            <div className="peopleTableHeader">
              <button type="button" onClick={() => toggleSort('name')}>姓名{sortKey === 'name' ? (sortDirection === 'asc' ? ' ↑' : ' ↓') : ''}</button>
              <button type="button" onClick={() => toggleSort('nickname')}>昵称{sortKey === 'nickname' ? (sortDirection === 'asc' ? ' ↑' : ' ↓') : ''}</button>
              <div className="peopleGroupHeader">
                <button type="button" onClick={() => toggleSort('group')}>组别{sortKey === 'group' ? (sortDirection === 'asc' ? ' ↑' : ' ↓') : ''}</button>
                <select value={tableGroupFilter} onChange={event => setTableGroupFilter(event.target.value)} aria-label="列表组别筛选">
                  {['全部', ...PEOPLE_GROUPS].map(group => <option key={group}>{group}</option>)}
                </select>
              </div>
              {[
                ['relation', '关系'], ['gender', '性别'], ['start', '开始'], ['end', '结束'], ['frequency', '联系'], ['personColor', '印象'], ['actions', ''], ['note', '备注'], ['witness', '雪粒的见证语'],
              ].map(([key, label]) => (
                <button type="button" key={key} onClick={() => toggleSort(key)}>
                  {label}{sortKey === key ? (sortDirection === 'asc' ? ' ↑' : ' ↓') : ''}
                </button>
              ))}
            </div>

            {tablePeople.length === 0 && <p className="peopleEmpty"></p>}

            {tablePeople.map(person => (
              <div className="peopleTableRow" key={person.id}>
                <span className="peopleNameCell"><strong>{person.name}</strong><button type="button" className="peopleInlineEdit" title="编辑" aria-label={`编辑${person.name}`} onClick={() => openEdit(person)}>✎</button></span>
                <span>{person.nickname || '未设'}</span>
                <span>{person.group || '—'}</span>
                <span>{person.relation || '—'}</span>
                <span>{person.gender || '—'}</span>
                <span>{formatDateParts(person.startYear, person.startMonth)}</span>
                <span>{formatDateParts(person.endYear, person.endMonth)}</span>
                <span>{person.frequency || '—'}</span>
                <span className="peopleTableColorCell"><i style={{ background: normalizePersonColor(person.personColor) }} /></span>
                <span className="peopleActions">
                  <button type="button" title="删除" aria-label={`删除${person.name}`} className="delete peopleTrashBtn" onClick={() => requestDelete(person)}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v5m4-5v5" /></svg>
                  </button>
                </span>
                <span className="peopleNoteCell">{person.note || '—'}</span>
                <span className={`peopleWitnessCell ${expandedWitnessId === person.id ? 'open' : ''}`}>
                  <button type="button" className="peopleWitnessToggle" onClick={() => setExpandedWitnessId(prev => prev === person.id ? null : person.id)} aria-label="展开雪粒的见证语">
                    {expandedWitnessId === person.id ? '⌄' : '›'}
                    <span>{person.witnessEntries?.length || 0}</span>
                  </button>
                  {expandedWitnessId === person.id && (
                    <div className="peopleWitnessText">
                      {(person.witnessEntries || []).length ? person.witnessEntries.map((text, index) => <p key={index}>{text}</p>) : <p>雪粒还没有留下见证语。</p>}
                    </div>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="peopleBottomLinks">
          <button type="button" onClick={openAdd}>＋ 新增</button>
          <button type="button" onClick={() => {
            const parts = monthPartsFromValue(activeBirthDate)
            setBirthdayYearDraft(parts.year || '')
            setBirthdayMonthDraft(parts.month || '')
            setTestTodayDraft(monthChineseDraft(testTodayMonth || currentMonthValue()))
            setShowBirthdayEditor(true)
          }}>设置</button>
          <span className="peopleDragTip">注：点人物圆圈存照片，按住轻移调位置。</span>
        </div>
      </section>

      {showPeopleInfo && (
        <div className="peopleInfoOverlay">
          <section className="peopleInfoPage">
            <header className="peopleInfoHeader">
              <button type="button" className="peopleInfoBack" onClick={() => setShowPeopleInfo(false)} aria-label="返回">‹</button>
              <h3>人间说明</h3>
              <span />
            </header>
            <div className="peopleInfoBody">
              <p>圆圈越大，表示关系时间越长。距离越近，表示联系越频繁。</p>
              <p>颜色可代表印象冷暖深浅，也可以随机选择。</p>
              <p>默认看到的是今天，也可以选择过去或未来月份，看图形变化。</p>
              <p>人物资料可随时更新，点圆圈添加或删改照片。关系停留或变化，都可留在记录里。</p>
            </div>
          </section>
        </div>
      )}

      {photoTarget && (
        <div className="peopleEditorOverlay peoplePhotoOverlay">
          <section
            className={`peopleEditor peoplePhotoPanel ${
              (photoEditing ? photoAlbumDraft : albumsForTarget()).length
                ? 'hasAlbums'
                : ''
            }`}
          >
            <button
              type="button"
              className="peoplePhotoClose"
              onClick={closePhotoArea}
              aria-label="关闭照片区"
            >
              ×
            </button>

            <h3>{photoTarget.name}</h3>

            <div className="peoplePhotoToolbar">
              {isPhotoIndexAvailable() ? (
                <button
                  type="button"
                  className="peoplePhotoToolButton peoplePhotoUploadButton peoplePhotoIndexUploadButton"
                  title="上传照片"
                  aria-label="上传照片"
                  onClick={() => pickPeoplePhotos()}
                >
                  <img
                    src="/refine/footprint_photoicon.png"
                    alt=""
                    aria-hidden="true"
                  />
                </button>
              ) : (
                <label
                  className="peoplePhotoToolButton peoplePhotoUploadButton"
                  title="上传照片"
                  aria-label="上传照片"
                >
                  <img
                    src="/refine/footprint_photoicon.png"
                    alt=""
                    aria-hidden="true"
                  />
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={event => {
                      pickPeoplePhotos(event.target.files)
                      event.currentTarget.value = ''
                    }}
                  />
                </label>
              )}

              <button
                type="button"
                className={`peoplePhotoToolButton peoplePhotoEditButton ${photoEditing ? 'active peoplePhotoSaveButton' : ''}`}
                onClick={event => {
                  event.preventDefault()
                  event.stopPropagation()

                  if (photoEditing) {
                    savePhotoEdit()
                  } else {
                    beginPhotoEdit()
                  }
                }}
                title={photoEditing ? '保存' : '编辑照片目录'}
                aria-label={photoEditing ? '保存' : '编辑照片目录'}
              >
                {photoEditing ? (
                  <svg
                    className="peoplePhotoSaveIcon"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      d="M5 3.75h11.2L20.25 7.8V20.25H3.75V3.75H5Zm1.25 1.5v5.25h10.5V5.25H6.25Zm1.5 9v4.5h8.5v-4.5h-8.5Z"
                      fill="currentColor"
                    />
                  </svg>
                ) : (
                  '✎'
                )}
              </button>

              {photoEditing && (
                <button
                  type="button"
                  className="peoplePhotoAddAlbum"
                  onClick={addPhotoAlbum}
                >
                  <span>＋</span>分册(可上传或拖入)
                </button>
              )}
            </div>

            {(photoEditing ? photoAlbumDraft : albumsForTarget()).length > 0 && (
              <div className="peoplePhotoAlbumLine">
                {(photoEditing ? photoAlbumDraft : albumsForTarget()).length > 4 && (
                  <button
                    type="button"
                    className="peoplePhotoAlbumArrow"
                    disabled={photoAlbumWindowStart <= 0}
                    onClick={() =>
                      setPhotoAlbumWindowStart(prev => Math.max(0, prev - 1))
                    }
                    aria-label="上一组分册"
                  >
                    ‹
                  </button>
                )}

                <div className="peoplePhotoAlbumViewport">
                  <div className="peoplePhotoAlbumGrid">
                    {(photoEditing ? photoAlbumDraft : albumsForTarget())
                      .slice(photoAlbumWindowStart, photoAlbumWindowStart + 4)
                      .map(album => {
                        const active = String(selectedPhotoAlbumId) === String(album.id)

                        return (
                          <div
                            key={album.id}
                            className={`peoplePhotoAlbumCapsule ${active ? 'active' : ''} ${photoEditing ? 'editing' : ''} ${photoDragActive ? 'photoDragActive' : ''}`}
                            data-album-id={album.id}
                          >
                            {photoEditing ? (
                              <>
                                <input
                                  type="text"
                                  value={album.title}
                                  placeholder="请输入"
                                  autoFocus={String(newPhotoAlbumId) === String(album.id)}
                                  onFocus={() => {
                                    setSelectedPhotoAlbumId(album.id)
                                    if (String(newPhotoAlbumId) === String(album.id)) {
                                      setNewPhotoAlbumId('')
                                    }
                                  }}
                                  onChange={event =>
                                    renamePhotoAlbum(album.id, event.target.value)
                                  }
                                  maxLength={8}
                                />
                                <button
                                  type="button"
                                  className="peoplePhotoAlbumDelete"
                                  onClick={event => {
                                    event.preventDefault()
                                    event.stopPropagation()
                                    deletePhotoAlbum(album.id)
                                  }}
                                  aria-label="删除分册"
                                >
                                  −
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                className="peoplePhotoAlbumSelect"
                                onTouchStart={event => {
                                  event.stopPropagation()
                                }}
                                onClick={event => {
                                  event.preventDefault()
                                  event.stopPropagation()
                                  selectPhotoAlbum(album.id)
                                }}
                              >
                                {album.title || '未命名'}
                              </button>
                            )}
                          </div>
                        )
                      })}
                  </div>
                </div>

                {(photoEditing ? photoAlbumDraft : albumsForTarget()).length > 4 && (
                  <button
                    type="button"
                    className="peoplePhotoAlbumArrow"
                    disabled={
                      photoAlbumWindowStart
                      >= (photoEditing ? photoAlbumDraft : albumsForTarget()).length - 4
                    }
                    onClick={() =>
                      setPhotoAlbumWindowStart(prev =>
                        Math.min(
                          Math.max(
                            0,
                            (photoEditing ? photoAlbumDraft : albumsForTarget()).length - 4,
                          ),
                          prev + 1,
                        )
                      )
                    }
                    aria-label="下一组分册"
                  >
                    ›
                  </button>
                )}
              </div>
            )}

            <div className="peoplePhotoScroll">
              {photosForSelectedAlbum(photoEditing ? photoDraft : photosForTarget()).length > 0 ? (
                <div className="peoplePhotoGrid">
                  {photosForSelectedAlbum(photoEditing ? photoDraft : photosForTarget()).map(
                    (photo, index) => {
                      const visiblePhotos = photosForSelectedAlbum(
                        photoEditing ? photoDraft : photosForTarget(),
                      )
                      return (
                        <div
                          className={`peoplePhotoItem ${photoDragActive ? 'photoDragging' : ''}`}
                          data-photo-global-index={peoplePhotoGlobalIndex(photo)}
                          key={
                            photo.id
                            || photo.assetIdentifier
                            || photo.uri
                            || index
                          }
                          onTouchStart={event => beginPeoplePhotoTouch(event, photo)}
                          onContextMenu={event => event.preventDefault()}
                        >
                          <button
                            type="button"
                            className="peoplePhotoOpen"
                            onClick={() =>
                              openPeoplePhoto(
                                photo,
                                visiblePhotos,
                                index,
                              )
                            }
                          >
                            <img
                              src={photo.thumbnail}
                              alt={`${photoTarget.name}照片${index + 1}`}
                            />
                          </button>

                          {photoEditing && (
                            <>
                              <span className="peoplePhotoDragHint">按住拖动</span>
                              {(photoIndexMeta(photo).device || photoIndexMeta(photo).date) && (
                                <span className="peoplePhotoIndexMeta">
                                  {photoIndexMeta(photo).device && <span>{photoIndexMeta(photo).device}</span>}
                                  {photoIndexMeta(photo).date && <span>{photoIndexMeta(photo).date}</span>}
                                </span>
                              )}
                            </>
                          )}

                          {photoEditing && (
                            <button
                              type="button"
                              className="peoplePhotoDelete"
                              onClick={event => {
                                event.preventDefault()
                                event.stopPropagation()
                                removePhotoDraft(photo)
                              }}
                              aria-label="从雪粒移除这张照片"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      )
                    },
                  )}
                </div>
              ) : (
                <p className="peoplePhotoEmpty">
                  {selectedPhotoAlbumId ? '这个分册还没有照片。' : '还没有未分类照片。'}
                </p>
              )}
            </div>
          </section>
        </div>
      )}

      {editing && (
        <div className="peopleEditorOverlay">
          <div className="peopleEditor">
            <h3>{editing === 'new' ? '' : ''}</h3>

            <div className="peopleEditorGrid peopleNameNickGrid">
              <label>姓名<input value={draft.name} onChange={event => updateDraft('name', event.target.value)} placeholder="必填，建议填全名" /></label>
              <label>昵称<input value={draft.nickname} onChange={event => { setNicknameError(''); updateDraft('nickname', event.target.value) }} placeholder="限2汉字或4字母" />{nicknameError && <small className="peopleFieldError">{nicknameError}</small>}</label>
            </div>

            <div className="peopleEditorGrid">
              <label>组别<select value={draft.group} onChange={event => updateDraft('group', event.target.value)}><option value="">请选择</option>{PEOPLE_GROUPS.map(group => <option key={group}>{group}</option>)}</select></label>
              <label>性别<select value={draft.gender} onChange={event => updateDraft('gender', event.target.value)}><option value="">请选择</option>{PEOPLE_GENDERS.map(gender => <option key={gender}>{gender}</option>)}</select></label>
            </div>

            <div className="peopleEditorGrid peopleRelationContactGrid">
              <label>关系<input value={draft.relation} onChange={event => updateDraft('relation', event.target.value)} placeholder="例如大学同学" /></label>
              <label>联系<select value={draft.frequency} onChange={event => updateDraft('frequency', event.target.value)}><option value="">请选择</option>{FREQUENCY_OPTIONS.map(item => <option key={item}>{item}</option>)}</select></label>
            </div>

            <div className="peopleDateRangeLine">
              <span className="peopleDateRangeLabel">从</span>
              <input className="peopleYearInput" aria-label="开始年份" inputMode="numeric" value={draft.startYear} onChange={event => updateDraft('startYear', event.target.value.replace(/[^0-9]/g, '').slice(0, 4))} placeholder="年份" />
              <input className="peopleMonthInput" aria-label="开始月份" inputMode="numeric" value={draft.startMonth} onChange={event => updateDraft('startMonth', event.target.value.replace(/[^0-9]/g, '').slice(0, 2))} placeholder="月" />
              <span className="peopleDateRangeLabel peopleDateToLabel">至</span>
              <input className="peopleYearInput" aria-label="结束年份" inputMode="numeric" value={draft.endYear} onChange={event => updateDraft('endYear', event.target.value.replace(/[^0-9]/g, '').slice(0, 4))} placeholder="年份" />
              <input className="peopleMonthInput" aria-label="结束月份" inputMode="numeric" value={draft.endMonth} onChange={event => updateDraft('endMonth', event.target.value.replace(/[^0-9]/g, '').slice(0, 2))} placeholder="月" />
            </div>

            <label className="peopleImpressionField">印象
              <ImpressionColorBoard value={draft.personColor} onChange={value => updateDraft('personColor', value)} />
            </label>

            <label className="peopleNoteField">备注<textarea value={draft.note} onChange={event => updateDraft('note', event.target.value)} placeholder="联系方式，重要事件等。" /></label>

            <div className="peopleEditorActions">
              <button type="button" onClick={savePerson}>保存</button>
              <button type="button" onClick={closeEditor}>取消</button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="peopleDeleteOverlay">
          <div className="peopleDeleteDialog">
            <h3>删除这条记录？</h3>
            <p>“{deleteTarget.name}”及其历史记录将被删除，无法恢复。</p>
            <div className="peopleDeleteActions">
              <button type="button" onClick={() => setDeleteTarget(null)}>取消</button>
              <button type="button" className="confirm" onClick={confirmDelete}>确认删除</button>
            </div>
          </div>
        </div>
      )}

      {showBirthdayEditor && (
        <div className="peopleEditorOverlay">
          <div className="peopleEditor peopleBirthdayEditor">
            <h3>设置</h3>
            <p>初始年月是“我”来到人间的起点，即生日。人物圆圈按关系持续时间与年龄比例生成；没有填写时，人物记录可以保存，但人际关系图暂不生成。</p>
            <div className="peopleEditorGrid peopleBirthdayGrid">
              <label>
                初始年份
                <input
                  type="text"
                  inputMode="numeric"
                  value={birthdayYearDraft}
                  placeholder="例如：1999"
                  maxLength={4}
                  onChange={event => {
                    setBirthdayYearDraft(event.target.value.replace(/[^0-9]/g, '').slice(0, 4))
                  }}
                />
              </label>
              <label>
                月份
                <input
                  type="text"
                  inputMode="numeric"
                  value={birthdayMonthDraft}
                  placeholder="例如：1或12"
                  maxLength={2}
                  onChange={event => {
                    setBirthdayMonthDraft(event.target.value.replace(/[^0-9]/g, '').slice(0, 2))
                  }}
                  onBlur={() => {
                    if (!birthdayMonthDraft) return
                    const month = Number(birthdayMonthDraft)
                    if (month >= 1 && month <= 12) setBirthdayMonthDraft(pad2(month))
                  }}
                />
              </label>
            </div>
            <label>今天（年月）
              <input
                type="text"
                inputMode="numeric"
                value={testTodayDraft}
                readOnly={!testTodayUnlocked}
                aria-readonly={!testTodayUnlocked}
                onPointerDown={event => {
                  if (!testTodayUnlocked) unlockTestToday(event)
                }}
                onClick={event => {
                  if (!testTodayUnlocked) {
                    event.preventDefault()
                    event.stopPropagation()
                  }
                }}
                onFocus={event => {
                  if (!testTodayUnlocked) {
                    event.currentTarget.blur()
                  }
                }}
                onKeyDown={event => {
                  if (!testTodayUnlocked) {
                    event.preventDefault()
                    unlockTestToday(event)
                  }
                }}
                onChange={event => {
                  if (!testTodayUnlocked) return
                  setTestTodayDraft(event.target.value.replace(/[^0-9年月/-]/g, '').slice(0, 9))
                }}
              />
            </label>
            <div className="peopleEditorActions">
              <button type="button" onClick={saveBirthday}>保存</button>
              <button type="button" onClick={() => setShowBirthdayEditor(false)}>取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
