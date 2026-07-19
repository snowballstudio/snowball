import { useMemo, useRef, useState } from 'react'
import './People.css'

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

// 关键词以后主要改这里：分冷/暖两组，页面会自动生成多选按钮。
const WARM_KEYWORDS = ['温暖', '信任', '亲近', '支持', '安心', '快乐', '珍惜', '重要', '喜欢', '牵挂', '在意', '浪漫', '欣赏', '感恩', '爱']
const COOL_KEYWORDS = ['疏远', '冷淡', '客气', '压力', '复杂', '紧张', '戒备', '遗憾', '愤怒', '应酬', '忍耐', '埋怨', '负疚', '厌烦', '恨']

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
  keyword: '',
  keywords: [],
  impressionDepth: '',
  note: '',
  witnessEntries: [],
  history: [],
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

function normalizeKeywords(person) {
  if (Array.isArray(person?.keywords)) return person.keywords.filter(Boolean)
  if (person?.keyword) return String(person.keyword).split(/[、,，\s]+/).filter(Boolean)
  return []
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
    keywords: normalizeKeywords(normalized),
    impressionDepth: normalized.impressionDepth,
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
  // 关系时长比例对应圆的面积比例；直径按面积比例开平方。
  // 最小面积保留为“我”的 10%，避免新认识的人小到无法辨认。
  const areaRatio = Math.max(0.10, personMonths / selfMonths)
  return Math.round(clamp(selfSize * Math.sqrt(areaRatio), 12, 180))
}

function distanceFromFrequency(frequency) {
  return RING_RADII[frequency] || RING_RADII['数月']
}

function keywordTone(keywords) {
  const list = Array.isArray(keywords) ? keywords : []
  const warm = list.filter(word => WARM_KEYWORDS.includes(word)).length
  const cool = list.filter(word => COOL_KEYWORDS.includes(word)).length
  if (warm > cool) return { tone: 'warm', dominantCount: warm }
  if (cool > warm) return { tone: 'cold', dominantCount: cool }

  // 冷暖词数量相同时，按用户最先选择的词决定色系，保持结果稳定。
  const first = list[0]
  if (WARM_KEYWORDS.includes(first)) return { tone: 'warm', dominantCount: warm }
  if (COOL_KEYWORDS.includes(first)) return { tone: 'cold', dominantCount: cool }
  return { tone: 'warm', dominantCount: Math.max(1, warm) }
}

function keywordCountBand(count) {
  if (count >= 7) return '7words'
  if (count >= 4) return '4to6words'
  return '1to3words'
}

function keywordRatioBand(dominantCount, totalCount) {
  const ratio = totalCount > 0 ? dominantCount / totalCount : 0.5
  return ratio >= 0.75 ? '3to4quarter' : '2to3quarter'
}

function dotColorStyle(person) {
  const keywords = normalizeKeywords(person)
  if (!keywords.length) {
    return {
      background: 'rgba(222, 225, 224, 0.78)',
      borderColor: 'rgba(80, 88, 96, 0.14)',
    }
  }
  const totalCount = keywords.length
  const { tone, dominantCount } = keywordTone(keywords)
  const file = `${tone}_${keywordCountBand(totalCount)}_${keywordRatioBand(dominantCount, totalCount)}.png`

  return {
    backgroundImage: `url(/refine/${file})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  }
}

function iconFadeStyle(person) {
  const score = clamp(Number(person.impressionDepth ?? 5), 1, 10)
  const opacity = 0.10 + ((score - 1) / 9) * 0.90
  const brightness = 2.55 - ((score - 1) / 9) * 1.55
  const contrast = 0.36 + ((score - 1) / 9) * 0.64
  return {
    opacity,
    filter: `grayscale(1) brightness(${brightness}) contrast(${contrast})`,
  }
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
  if (key === 'impressionDepth') return Number(person.impressionDepth || 0)
  if (key === 'note') return person.note || ''
  if (key === 'updatedAt') return Number(person.updatedAt || person.id || 0)
  if (key === 'monthsKnown') return monthsKnown(person, targetMonth)
  return ''
}

function normalizePerson(person) {
  const keywords = normalizeKeywords(person)
  const rawDepth = person?.impressionDepth
  return {
    ...EMPTY_PERSON,
    ...(person || {}),
    nickname: String(person?.nickname || '').trim(),
    group: person?.group === '' ? '' : (PEOPLE_GROUPS.includes(person?.group) ? person.group : '其他'),
    gender: person?.gender === '' ? '' : (PEOPLE_GENDERS.includes(person?.gender) ? person.gender : '女'),
    frequency: person?.frequency === '' ? '' : (FREQUENCY_OPTIONS.includes(person?.frequency) ? person.frequency : '数月'),
    keywords,
    keyword: keywords.length ? keywords.join('、') : '',
    impressionDepth: rawDepth === '' || rawDepth === undefined || rawDepth === null
      ? ''
      : clamp(Number(rawDepth), 1, 10),
    witnessEntries: Array.isArray(person?.witnessEntries) ? person.witnessEntries : (person?.witnessText ? [person.witnessText] : []),
    history: Array.isArray(person?.history) ? person.history : [],
  }
}

function validNickname(value) {
  const text = String(value || '').trim()
  if (!text) return false
  if (/^[A-Za-z]+$/.test(text)) return true
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
  const keywords = normalizeKeywords(person)
  const hasDepth = person.impressionDepth !== '' && person.impressionDepth !== undefined && person.impressionDepth !== null
  if (!keywords.length && !hasDepth) return '尚待补充'
  const { tone } = keywordTone(keywords)
  const score = hasDepth ? clamp(Number(person.impressionDepth), 1, 10) : 5
  const clarity = hasDepth ? (score >= 8 ? '清晰' : score >= 5 ? '淡淡' : '已经变浅') : '尚未标明深浅'
  if (!keywords.length) return clarity
  const temperature = tone === 'warm' ? '温暖' : '冷静'
  return `${clarity}而${temperature}`
}

function changedFields(before, after) {
  if (!before) return ['create']
  const checks = [
    ['end', `${before.endYear}-${before.endMonth}`, `${after.endYear}-${after.endMonth}`],
    ['frequency', before.frequency, after.frequency],
    ['impression', before.impressionDepth, after.impressionDepth],
    ['keywords', normalizeKeywords(before).join('|'), normalizeKeywords(after).join('|')],
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
  if (changes.includes('impression') || changes.includes('keywords')) {
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

function KeywordPicker({ value, onChange }) {
  const selected = Array.isArray(value) ? value : []
  function toggle(word) {
    const next = selected.includes(word)
      ? selected.filter(item => item !== word)
      : [...selected, word]
    onChange(next)
  }

  return (
    <div className="peopleKeywordPicker">
      <div>
        <strong>暖色</strong>
        <div className="peopleKeywordButtons">
          {WARM_KEYWORDS.map(word => (
            <button type="button" key={word} className={selected.includes(word) ? 'active warm' : ''} onClick={() => toggle(word)}>{word}</button>
          ))}
        </div>
      </div>
      <div>
        <strong>冷色</strong>
        <div className="peopleKeywordButtons">
          {COOL_KEYWORDS.map(word => (
            <button type="button" key={word} className={selected.includes(word) ? 'active cool' : ''} onClick={() => toggle(word)}>{word}</button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function People({ people = [], setData, onClose, birthDate = '' }) {
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
  const [witnessPopup, setWitnessPopup] = useState('')
  const [expandedWitnessId, setExpandedWitnessId] = useState(null)
  const [showPeopleInfo, setShowPeopleInfo] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [dragAngles, setDragAngles] = useState({})
  const mapCanvasRef = useRef(null)
  const dragRef = useRef(null)
  const suppressClickRef = useRef({ id: null, until: 0 })

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
      setNicknameError('昵称必填：限两个汉字，或一个英文单词。')
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
      keyword: normalizeKeywords(draft).join('、'),
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
    if (canAddWitness) setWitnessPopup(witnessText)
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
    openEdit(person)
  }

  return (
    <div className="peopleOverlay">
      <section className="peoplePanel">
        <header className="peopleTopBar">
          <button className="peopleBackBtn" type="button" onClick={onClose} aria-label="返回">‹</button>
          <div className="peopleTitleBlock">
            <h2>人间的我</h2>
            <p>生命中出现过的人，亲疏新旧，冷暖自知。</p>
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
            <img className="peopleWitnessCat" src="/refine/people_background_cat.png" alt="雪粒在见证人间" />
            {!activeBirthDate && <div className="peopleInitialDatePrompt">请先在“设置”中填写初始年月，人间图随后自动生成。</div>}
            {activeBirthDate && RING_LABELS.map(ring => (
              <div
                key={ring.key}
                className={`peopleRing peopleRing-${ring.key === 'self' ? 'selfLine' : 'frequency'}`}
                style={{ width: `${ring.radius * 2}%`, height: `${ring.radius * 2}%` }}
                aria-hidden="true"
              />
            ))}
            {activeBirthDate && <div className="peopleSelf" style={{ width: `${selfSize}px`, height: `${selfSize}px`, marginLeft: `${-selfSize / 2}px`, marginTop: `${-selfSize / 2}px` }}>我</div>}
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
                ['relation', '关系'], ['gender', '性别'], ['start', '开始'], ['end', '结束'], ['frequency', '联系频率'], ['impressionDepth', '印象值'], ['actions', ''], ['note', '备注'], ['witness', '粒的见证语'],
              ].map(([key, label]) => (
                <button type="button" key={key} onClick={() => toggleSort(key)}>
                  {label}{sortKey === key ? (sortDirection === 'asc' ? ' ↑' : ' ↓') : ''}
                </button>
              ))}
            </div>

            {tablePeople.length === 0 && <p className="peopleEmpty">这里还没有人物。可以从左下角新增第一个人。</p>}

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
                <span>{person.impressionDepth || '—'}</span>
                <span className="peopleActions">
                  <button type="button" title="删除" aria-label={`删除${person.name}`} className="delete peopleTrashBtn" onClick={() => requestDelete(person)}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v5m4-5v5" /></svg>
                  </button>
                </span>
                <span className="peopleNoteCell">{person.note || '—'}</span>
                <span className={`peopleWitnessCell ${expandedWitnessId === person.id ? 'open' : ''}`}>
                  <button type="button" className="peopleWitnessToggle" onClick={() => setExpandedWitnessId(prev => prev === person.id ? null : person.id)} aria-label="展开粒的见证语">
                    {expandedWitnessId === person.id ? '⌄' : '›'}
                    <span>{person.witnessEntries?.length || 0}</span>
                  </button>
                  {expandedWitnessId === person.id && (
                    <div className="peopleWitnessText">
                      {(person.witnessEntries || []).length ? person.witnessEntries.map((text, index) => <p key={index}>{text}</p>) : <p>粒还没有留下见证语。</p>}
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
          <span className="peopleDragTip">小贴士：手指按住圆圈轻移可调整位置。</span>
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
              <p>圆圈越大，表示这段关系陪伴你的时间越长。距离越近，表示联系越频繁。</p>
              <p>颜色记录人间冷暖，关键词越多，色彩越明确。人物图标越深，表示这份印象越清晰。</p>
              <p>默认看到的是今天。你也可以选择过去或未来的月份，看人间如何变化。</p>
              <p>人物资料可以随时更新。联系减少、关系停留或重新靠近，都会留在你的记录里。</p>
            </div>
          </section>
        </div>
      )}

      {editing && (
        <div className="peopleEditorOverlay">
          <div className="peopleEditor">
            <h3>{editing === 'new' ? '新增' : '编辑人物'}</h3>
            <label>姓名<input value={draft.name} onChange={event => updateDraft('name', event.target.value)} placeholder="必填，建议填全名" /></label>
            <label>昵称<span className="peopleFieldHint">限两个汉字或一个英文单词，必填。</span><input value={draft.nickname} onChange={event => { setNicknameError(''); updateDraft('nickname', event.target.value) }} placeholder="例如：妈妈，王总，JACK" />{nicknameError && <small className="peopleFieldError">{nicknameError}</small>}</label>
            <div className="peopleEditorGrid">
              <label>组别<select value={draft.group} onChange={event => updateDraft('group', event.target.value)}><option value="">请选择</option>{PEOPLE_GROUPS.map(group => <option key={group}>{group}</option>)}</select></label>
              <label>性别<select value={draft.gender} onChange={event => updateDraft('gender', event.target.value)}><option value="">请选择</option>{PEOPLE_GENDERS.map(gender => <option key={gender}>{gender}</option>)}</select></label>
            </div>
            <label>关系<input value={draft.relation} onChange={event => updateDraft('relation', event.target.value)} placeholder="建议具体，例如大学同学，直接上司，老客户" /></label>
            <div className="peopleEditorGrid">
              <label>开始年份<input inputMode="numeric" value={draft.startYear} onChange={event => updateDraft('startYear', event.target.value.replace(/[^0-9]/g, '').slice(0, 4))} placeholder="例如：2020" /></label>
              <label>月份<input inputMode="numeric" value={draft.startMonth} onChange={event => updateDraft('startMonth', event.target.value.replace(/[^0-9]/g, '').slice(0, 2))} placeholder="例如：6，10" /></label>
            </div>
            <div className="peopleEditorGrid">
              <label>结束年份<input inputMode="numeric" value={draft.endYear} onChange={event => updateDraft('endYear', event.target.value.replace(/[^0-9]/g, '').slice(0, 4))} placeholder="关系存续时可空" /></label>
              <label>月份<input inputMode="numeric" value={draft.endMonth} onChange={event => updateDraft('endMonth', event.target.value.replace(/[^0-9]/g, '').slice(0, 2))} placeholder="关系存续时可空" /></label>
            </div>
            <label>联系频率<select value={draft.frequency} onChange={event => updateDraft('frequency', event.target.value)}><option value="">请选择</option>{FREQUENCY_OPTIONS.map(item => <option key={item}>{item}</option>)}</select></label>
            <label>印象关键词（多选，数量不限）<KeywordPicker value={normalizeKeywords(draft)} onChange={value => updateDraft('keywords', value)} /></label>
            <label>印象值<input type="number" min="1" max="10" step="1" value={draft.impressionDepth} placeholder="请输入数字1-10表示印象深浅。" onChange={event => {
              const value = event.target.value
              if (value === '') {
                updateDraft('impressionDepth', '')
                return
              }
              const onlyNumber = value.replace(/[^0-9]/g, '').slice(0, 2)
              updateDraft('impressionDepth', onlyNumber)
            }} onBlur={() => {
              if (draft.impressionDepth !== '') updateDraft('impressionDepth', clamp(Number(draft.impressionDepth), 1, 10))
            }} /></label>
            <div className="peopleDepthBar" aria-hidden="true"><span style={{ width: `${draft.impressionDepth === '' ? 0 : clamp(Number(draft.impressionDepth), 1, 10) * 10}%` }} /></div>
            <label>备注<textarea value={draft.note} onChange={event => updateDraft('note', event.target.value)} placeholder="联系方式，重要事件等。" /></label>
            <div className="peopleEditorActions">
              <button type="button" onClick={savePerson}>保存</button>
              <button type="button" onClick={closeEditor}>取消</button>
            </div>
          </div>
        </div>
      )}

      {witnessPopup && (
        <div className="peopleWitnessPopupOverlay">
          <div className="peopleWitnessPopup">
            <button type="button" className="peopleWitnessClose" onClick={() => setWitnessPopup('')} aria-label="关闭">×</button>
            <img src="/refine/people_background_cat.png" alt="雪粒" />
            <p>{witnessPopup}</p>
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
            <p>初始年月是“我”来到人间的起点，也可以按自己的理解设置。人物圆圈按关系持续月数与人生月数的比例生成；没有填写时，人物记录可以保存，但人间图暂不生成。</p>
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
