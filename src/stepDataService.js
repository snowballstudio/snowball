const STEP_SOURCE_LABELS = {
  healthConnect: 'Health Connect',
  huaweiHealthKit: 'Huawei Health Kit',
  appleHealthKit: 'Apple Health Kit',
  dailyCumulative: '当日累计',
  catchUpCumulative: '跨日累计赋予昨日',
  noLogin: '未登录记零',
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
  if (match) {
    return `${match[1]}-${String(Number(match[2])).padStart(2, '0')}-${String(Number(match[3])).padStart(2, '0')}`
  }
  const date = value instanceof Date ? value : new Date(value || Date.now())
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function displayDate(key) {
  const match = String(key || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return match ? `${match[1]}/${Number(match[2])}/${Number(match[3])}` : String(key || '')
}

function dateBefore(value, days = 1) {
  const key = localDateKey(value)
  const match = key.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return ''
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  date.setDate(date.getDate() - days)
  return localDateKey(date)
}

function sourceFieldsForDay(day = {}, platform = '') {
  const explicitHealthConnect = finiteStep(
    day.healthConnectSteps ?? day.healthConnect ?? day.healthConnectDailySteps
  )
  const explicitHuawei = finiteStep(
    day.huaweiHealthSteps ?? day.huaweiHealthKitSteps ?? day.huaweiSteps
  )
  const explicitApple = finiteStep(
    day.appleHealthSteps ?? day.appleHealthKitSteps ?? day.healthKitSteps
  )
  const generic = finiteStep(day.steps)

  return {
    healthConnectSteps:
      explicitHealthConnect ?? (platform === 'android' && !explicitHuawei ? generic : null),
    huaweiHealthKitSteps:
      explicitHuawei,
    appleHealthKitSteps:
      explicitApple ?? (platform === 'ios' ? generic : null),
  }
}

function cumulativeFieldsForDay(day = {}, payload = {}) {
  return {
    firstCumulativeSteps: finiteStep(
      day.firstCumulativeSteps ??
      day.firstStepCounter ??
      day.cumulativeStepsFirst ??
      payload.firstCumulativeSteps
    ),
    lastCumulativeSteps: finiteStep(
      day.lastCumulativeSteps ??
      day.lastStepCounter ??
      day.cumulativeStepsLast ??
      day.cumulativeSteps ??
      day.stepCounter ??
      payload.lastCumulativeSteps ??
      payload.cumulativeSteps
    ),
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

export function calculateStepAutoRecord(record = {}) {
  const exact = chooseExactSource(record)
  if (exact) {
    return {
      ...record,
      calculatedSteps: exact.value,
      calculatedSource: exact.source,
      calculationStatus: 'exact',
      calculationNote: `${STEP_SOURCE_LABELS[exact.source]} 每日步数`,
    }
  }

  const first = finiteStep(record.firstCumulativeSteps)
  const last = finiteStep(record.lastCumulativeSteps)
  if (first !== null || last !== null) {
    const safeFirst = first ?? last ?? 0
    const safeLast = last ?? first ?? 0
    const resetDetected = safeLast < safeFirst
    const delta = resetDetected ? 0 : Math.max(0, safeLast - safeFirst)
    return {
      ...record,
      firstCumulativeSteps: safeFirst,
      lastCumulativeSteps: safeLast,
      cumulativeDelta: delta,
      calculatedSteps: delta,
      calculatedSource: 'dailyCumulative',
      calculationStatus: resetDetected ? 'estimated-reset' : 'estimated',
      calculationNote: resetDetected ? '累计值疑似因重启归零，本日按0计算' : '末次累计减首次累计',
    }
  }

  return {
    ...record,
    calculatedSteps: 0,
    calculatedSource: 'noLogin',
    calculationStatus: 'zero',
    calculationNote: '没有每日来源，也没有登录累计读数',
  }
}

function settleCatchUp(records = [], currentDate = '') {
  const sorted = [...records].sort((a, b) => localDateKey(a.date).localeCompare(localDateKey(b.date)))
  const currentKey = localDateKey(currentDate)
  const currentIndex = sorted.findIndex(item => localDateKey(item.date) === currentKey)
  if (currentIndex <= 0) return sorted

  const current = sorted[currentIndex]
  const currentFirst = finiteStep(current.firstCumulativeSteps)
  if (currentFirst === null) return sorted

  let previousIndex = currentIndex - 1
  while (previousIndex >= 0 && finiteStep(sorted[previousIndex].firstCumulativeSteps) === null) previousIndex -= 1
  if (previousIndex < 0) return sorted

  const previous = sorted[previousIndex]
  const previousFirst = finiteStep(previous.firstCumulativeSteps)
  if (previousFirst === null) return sorted

  const targetKey = dateBefore(currentKey, 1)
  const targetIndex = sorted.findIndex(item => localDateKey(item.date) === targetKey)
  if (targetIndex < 0) return sorted

  const target = sorted[targetIndex]
  if (chooseExactSource(target)) return sorted

  const resetDetected = currentFirst < previousFirst
  const delta = resetDetected ? 0 : Math.max(0, currentFirst - previousFirst)
  sorted[targetIndex] = {
    ...target,
    previousLoginDate: displayDate(localDateKey(previous.date)),
    cumulativeDelta: delta,
    calculatedSteps: delta,
    calculatedSource: 'catchUpCumulative',
    calculationStatus: resetDetected ? 'estimated-reset' : 'estimated-catchup',
    calculationNote: resetDetected
      ? '跨日累计疑似因重启归零，赋予昨日0步'
      : `从${displayDate(localDateKey(previous.date))}首次累计推算并赋予昨日`,
    updatedAt: Date.now(),
  }

  // 未登录的中间日期明确保留为0；以后若每日健康来源出现，会自动改正。
  for (let index = previousIndex + 1; index < targetIndex; index += 1) {
    if (!chooseExactSource(sorted[index])) {
      sorted[index] = {
        ...sorted[index],
        calculatedSteps: 0,
        calculatedSource: 'noLogin',
        calculationStatus: 'zero',
        calculationNote: '未登录日期记0，等待每日健康来源补录',
      }
    }
  }
  return sorted
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
    const hasCumulative = cumulative.firstCumulativeSteps !== null || cumulative.lastCumulativeSteps !== null

    const firstCumulative =
      finiteStep(previous.firstCumulativeSteps) ??
      cumulative.firstCumulativeSteps ??
      cumulative.lastCumulativeSteps
    const lastCumulative =
      cumulative.lastCumulativeSteps ??
      cumulative.firstCumulativeSteps ??
      finiteStep(previous.lastCumulativeSteps)

    const merged = calculateStepAutoRecord({
      ...previous,
      date: displayDate(key),
      ...Object.fromEntries(
        Object.entries(sources).map(([field, value]) => [field, value ?? previous[field] ?? null])
      ),
      firstCumulativeSteps: firstCumulative,
      lastCumulativeSteps: lastCumulative,
      firstCapturedAt: previous.firstCapturedAt || (hasCumulative ? capturedAt : null),
      lastCapturedAt: hasCumulative ? capturedAt : previous.lastCapturedAt || null,
      loginCount: liveToday && hasCumulative
        ? Math.max(1, Number(previous.loginCount || 0) + 1)
        : Number(previous.loginCount || 0),
      updatedAt: capturedAt,
      rawPlatform: platform,
    })
    map.set(key, merged)
  })

  let result = [...map.values()].sort((a, b) => localDateKey(b.date).localeCompare(localDateKey(a.date)))
  if (liveToday && days[0]?.date) {
    result = settleCatchUp(result, days[0].date)
      .sort((a, b) => localDateKey(b.date).localeCompare(localDateKey(a.date)))
  }
  return result
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
