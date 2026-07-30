const STEP_SOURCE_LABELS = {
  healthConnect: 'Health Connect',
  huaweiHealthKit: 'Huawei Health Kit',
  appleHealthKit: 'Apple Health Kit',
  nightlyCumulative: '23:50累计推算',
  dailyCumulative: '登录累计推算',
  catchUpCumulative: '跨日累计补算',
  noData: '暂无可计算数据',
  unavailable: '暂无来源',
}

function finiteStep(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  if (!Number.isFinite(number)) return null
  return Math.max(0, Math.round(number))
}

function localDateKey(value) {
  const raw = String(value || '').trim()
  const match = raw.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/)
  if (match) return `${match[1]}-${String(Number(match[2])).padStart(2, '0')}-${String(Number(match[3])).padStart(2, '0')}`
  const date = value instanceof Date ? value : new Date(value || Date.now())
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function displayDate(key) {
  const match = String(key || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return match ? `${match[1]}/${Number(match[2])}/${Number(match[3])}` : String(key || '')
}

function shiftDate(value, days) {
  const key = localDateKey(value)
  const match = key.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return ''
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  date.setDate(date.getDate() + days)
  return localDateKey(date)
}

function sourceFieldsForDay(day = {}, platform = '') {
  const explicitHealthConnect = finiteStep(day.healthConnectSteps ?? day.healthConnect ?? day.healthConnectDailySteps)
  const explicitHuawei = finiteStep(day.huaweiHealthSteps ?? day.huaweiHealthKitSteps ?? day.huaweiSteps)
  const explicitApple = finiteStep(day.appleHealthSteps ?? day.appleHealthKitSteps ?? day.healthKitSteps)
  const generic = finiteStep(day.steps)
  return {
    // Android的generic steps不能再自动冒充Health Connect；只有明确字段才算每日来源。
    healthConnectSteps: explicitHealthConnect,
    huaweiHealthKitSteps: explicitHuawei,
    appleHealthKitSteps: explicitApple ?? (platform === 'ios' ? generic : null),
  }
}

function cumulativeFieldsForDay(day = {}, payload = {}) {
  return {
    backgroundCumulativeSteps: finiteStep(day.backgroundCumulativeSteps),
    backgroundCapturedAt: Number(day.backgroundCapturedAt) || null,
    backgroundScheduledFor: Number(day.backgroundScheduledFor) || null,
    backgroundStepTestStatus: String(day.backgroundStepTestStatus || ''),
    firstCumulativeSteps: finiteStep(day.firstCumulativeSteps ?? day.firstStepCounter ?? day.cumulativeStepsFirst ?? payload.firstCumulativeSteps),
    lastCumulativeSteps: finiteStep(day.lastCumulativeSteps ?? day.lastStepCounter ?? day.cumulativeStepsLast ?? day.cumulativeSteps ?? day.stepCounter ?? payload.lastCumulativeSteps ?? payload.cumulativeSteps),
  }
}

function chooseExactSource(record = {}) {
  const candidates = [
    ['healthConnectSteps', 'healthConnect'],
    ['huaweiHealthKitSteps', 'huaweiHealthKit'],
    ['appleHealthKitSteps', 'appleHealthKit'],
  ]
  for (const [field, source] of candidates) {
    const value = finiteStep(record[field])
    if (value !== null) return { value, source }
  }
  return null
}

function ownEndpoint(record = {}) {
  return finiteStep(record.backgroundCumulativeSteps) ?? finiteStep(record.lastCumulativeSteps)
}

function ownStart(record = {}) {
  return finiteStep(record.firstCumulativeSteps)
}

function setZero(record, note) {
  return {
    ...record,
    calculatedSteps: 0,
    cumulativeDelta: 0,
    calculatedSource: 'noData',
    calculationStatus: 'zero',
    calculationNote: note,
  }
}

/**
 * 累计值容错原则：
 * 1. Health Connect / Apple HealthKit / Huawei HealthKit每日值永远优先。
 * 2. 无每日来源时，首选23:50后台累计边界；缺失时可用当日末次登录累计。
 * 3. 单独漏掉一天时，可用第二天首次累计作为该日结束边界，允许少量跨日偏移。
 * 4. 连续漏掉多天时，中间日保持0；重新登录日从最近一次可靠旧边界一次性catch up，
 *    因此该日可能很大，但总步数最终不会永久丢失。
 * 5. 累计值因重启变小则本段按0，避免负数。
 */
function recalculateCumulative(records = [], currentDate = '') {
  const sorted = [...records].sort((a, b) => localDateKey(a.date).localeCompare(localDateKey(b.date)))
  const currentKey = localDateKey(currentDate || new Date())
  const indexByKey = new Map(sorted.map((item, index) => [localDateKey(item.date), index]))
  const ownEnds = sorted.map(ownEndpoint)
  const starts = sorted.map(ownStart)

  // 只为“孤立缺失的一天”建立第二天首次累计替代边界。
  const resolvedEnds = [...ownEnds]
  for (let i = 0; i < sorted.length; i += 1) {
    if (resolvedEnds[i] !== null) continue
    const nextKey = shiftDate(sorted[i].date, 1)
    const nextIndex = indexByKey.get(nextKey)
    if (nextIndex === undefined || starts[nextIndex] === null) continue
    const previousKey = shiftDate(sorted[i].date, -1)
    const previousIndex = indexByKey.get(previousKey)
    const previousHasBoundary = previousIndex !== undefined && ownEnds[previousIndex] !== null
    if (previousHasBoundary) resolvedEnds[i] = starts[nextIndex]
  }

  let lastReliableBoundary = null
  let lastReliableDate = ''
  let missingRun = 0

  return sorted.map((record, index) => {
    const exact = chooseExactSource(record)
    const key = localDateKey(record.date)
    const end = resolvedEnds[index]
    const ownEnd = ownEnds[index]
    const start = starts[index]

    if (exact) {
      if (ownEnd !== null) {
        lastReliableBoundary = ownEnd
        lastReliableDate = key
        missingRun = 0
      }
      return {
        ...record,
        calculatedSteps: exact.value,
        calculatedSource: exact.source,
        calculationStatus: 'exact',
        calculationNote: `${STEP_SOURCE_LABELS[exact.source]}每日步数，优先于累计推算`,
      }
    }

    if (end === null) {
      missingRun += 1
      return setZero(record, '没有当日结束累计；只允许顺推到第二天，仍无数据则暂记0')
    }

    const previousKey = shiftDate(key, -1)
    const previousIndex = indexByKey.get(previousKey)
    let previousBoundary = previousIndex === undefined ? null : resolvedEnds[previousIndex]
    let source = finiteStep(record.backgroundCumulativeSteps) !== null ? 'nightlyCumulative' : 'dailyCumulative'
    let note = finiteStep(record.backgroundCumulativeSteps) !== null
      ? '当日23:50累计减去前一日结束累计'
      : '当日末次登录累计减去前一日结束累计'

    if (previousBoundary === null && start !== null && missingRun <= 1) {
      previousBoundary = start
      note = '前一日结束边界缺失，使用当日首次累计作为起点'
    }

    // 连续缺失多日后重新登录：不把总差值塞给中间某一天，而是在重新登录日一次catch up。
    if (previousBoundary === null && lastReliableBoundary !== null && (key === currentKey || Number(record.loginCount || 0) > 0)) {
      previousBoundary = lastReliableBoundary
      source = 'catchUpCumulative'
      note = `连续缺失后，从${displayDate(lastReliableDate)}最近可靠累计一次性补算；本日可能偏大`
    }

    if (previousBoundary === null) {
      // 数据库最早一天若有当天首次值，仍可计算当天内部增量。
      if (start !== null) {
        previousBoundary = start
        note = '缺少更早累计边界，按当日首次至结束累计计算'
      } else {
        missingRun += 1
        return setZero(record, '缺少可用的前一累计边界，暂记0')
      }
    }

    const resetDetected = end < previousBoundary
    const delta = resetDetected ? 0 : Math.max(0, end - previousBoundary)
    const catchUpFromDate = source === 'catchUpCumulative' ? lastReliableDate : ''
    lastReliableBoundary = ownEnd ?? end
    lastReliableDate = key
    missingRun = 0
    return {
      ...record,
      cumulativeDelta: delta,
      calculatedSteps: delta,
      calculatedSource: source,
      calculationStatus: resetDetected ? 'estimated-reset' : (source === 'catchUpCumulative' ? 'estimated-catchup' : 'estimated'),
      calculationNote: resetDetected ? '累计值小于前一边界，疑似手机重启，本段按0' : note,
      previousLoginDate: catchUpFromDate ? displayDate(catchUpFromDate) : record.previousLoginDate,
    }
  })
}

export function calculateStepAutoRecord(record = {}) {
  const exact = chooseExactSource(record)
  if (exact) {
    return {
      ...record,
      calculatedSteps: exact.value,
      calculatedSource: exact.source,
      calculationStatus: 'exact',
      calculationNote: `${STEP_SOURCE_LABELS[exact.source]}每日步数`,
    }
  }
  return { ...record }
}

export function ingestStepPayload(existingRecords = [], payload = {}, {
  platform = '',
  liveToday = false,
  capturedAt = Date.now(),
} = {}) {
  const map = new Map((existingRecords || []).map(item => [localDateKey(item.date), { ...item }]))
  const days = Array.isArray(payload?.days) ? payload.days : []

  days.forEach(day => {
    const key = localDateKey(day?.date)
    if (!key) return
    const previous = map.get(key) || { date: displayDate(key), loginCount: 0 }
    const sources = sourceFieldsForDay(day, platform)
    const cumulative = cumulativeFieldsForDay(day, payload)
    const hasLiveCumulative = cumulative.firstCumulativeSteps !== null || cumulative.lastCumulativeSteps !== null
    const isLiveDay = liveToday && key === localDateKey(days[0]?.date)

    const firstCumulative = finiteStep(previous.firstCumulativeSteps)
      ?? cumulative.firstCumulativeSteps
      ?? cumulative.lastCumulativeSteps
    const lastCumulative = cumulative.lastCumulativeSteps
      ?? cumulative.firstCumulativeSteps
      ?? finiteStep(previous.lastCumulativeSteps)

    map.set(key, {
      ...previous,
      date: displayDate(key),
      ...Object.fromEntries(Object.entries(sources).map(([field, value]) => [field, value ?? previous[field] ?? null])),
      firstCumulativeSteps: firstCumulative,
      lastCumulativeSteps: lastCumulative,
      backgroundCumulativeSteps: cumulative.backgroundCumulativeSteps ?? previous.backgroundCumulativeSteps ?? null,
      backgroundCapturedAt: cumulative.backgroundCapturedAt ?? previous.backgroundCapturedAt ?? null,
      backgroundScheduledFor: cumulative.backgroundScheduledFor ?? previous.backgroundScheduledFor ?? null,
      backgroundStepTestStatus: cumulative.backgroundStepTestStatus || previous.backgroundStepTestStatus || '',
      firstCapturedAt: previous.firstCapturedAt || (hasLiveCumulative ? capturedAt : null),
      lastCapturedAt: hasLiveCumulative ? capturedAt : previous.lastCapturedAt || null,
      loginCount: isLiveDay && hasLiveCumulative
        ? Math.max(1, Number(previous.loginCount || 0) + 1)
        : Number(previous.loginCount || 0),
      updatedAt: capturedAt,
      rawPlatform: platform,
    })
  })

  const currentDate = days[0]?.date || new Date()
  return recalculateCumulative([...map.values()], currentDate)
    .sort((a, b) => localDateKey(b.date).localeCompare(localDateKey(a.date)))
}

export function stepAutoRecordForDate(records = [], date = '') {
  const key = localDateKey(date)
  return (records || []).find(item => localDateKey(item.date) === key) || null
}

export function stepValueForDate(records = [], date = '') {
  const record = stepAutoRecordForDate(records, date)
  return record ? finiteStep(record.calculatedSteps) ?? 0 : null
}

export function stepSourceLabel(source = '') {
  return STEP_SOURCE_LABELS[source] || source || STEP_SOURCE_LABELS.unavailable
}
