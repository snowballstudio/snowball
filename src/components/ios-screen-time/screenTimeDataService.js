/**
 * Screen Time / 离机时间内部源表读取服务。
 *
 * 日常表仍保留原有 screenMinutes、offscreenTime 字段；
 * 本文件只负责按日期从内部源表取值。
 */

function sourceDateKey(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
  }

  const text = String(value || '').trim()
  const match = text.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/)
  if (!match) return text

  return `${match[1]}-${String(Number(match[2])).padStart(2, '0')}-${String(Number(match[3])).padStart(2, '0')}`
}

export function isScreenSystemTotalRow(row = {}) {
  return row?.recordType === 'screen-total'
}

export function screenRowsForDate(records = [], date = '') {
  const target = sourceDateKey(date)

  return (Array.isArray(records) ? records : [])
    .map((row, index) => ({ row, index }))
    .filter(item => sourceDateKey(item.row?.date) === target)
    .sort((a, b) => {
      if (isScreenSystemTotalRow(a.row)) return -1
      if (isScreenSystemTotalRow(b.row)) return 1
      return Number(b.row?.minutes || 0) - Number(a.row?.minutes || 0)
    })
}

export function screenMinutesForDetailRow(row = {}) {
  const value = Number(row?.minutes ?? 0)
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0
}

export function screenSystemTotalMinutesForDate(records = [], date = '') {
  const totalRow = screenRowsForDate(records, date)
    .map(item => item.row)
    .find(isScreenSystemTotalRow)

  return totalRow ? screenMinutesForDetailRow(totalRow) : null
}

export function screenAppSubtotalMinutesForDate(records = [], date = '') {
  return screenRowsForDate(records, date).reduce((sum, item) => {
    if (isScreenSystemTotalRow(item.row)) return sum
    return sum + screenMinutesForDetailRow(item.row)
  }, 0)
}

export function screenHoursInputValue(minutes) {
  const value = Number(minutes || 0)
  if (!value) return ''

  const hours = value / 60
  return Number.isInteger(hours)
    ? String(hours)
    : String(Math.round(hours * 10) / 10)
}

export function screenDurationText(minutes) {
  if (minutes === null || minutes === undefined) return '—'
  const value = Math.max(0, Math.round(Number(minutes || 0)))
  if (!value) return '—'
  if (value < 60) return `${value}分`
  return `${(value / 60).toFixed(1)}小时`
}

export function offscreenRecordForDate(records = [], date = '') {
  const target = sourceDateKey(date)

  return (Array.isArray(records) ? records : [])
    .find(row => sourceDateKey(row?.date) === target) || null
}

export function offscreenCalculatedTimeForDate(records = [], date = '') {
  const row = offscreenRecordForDate(records, date)
  return String(row?.calculatedOffscreenTime || '').trim()
}

/**
 * 将苹果 DeviceActivity 返回结果标准化为雪粒 APP 详情表能够直接接收的结构。
 *
 * 兼容常见原生字段名：
 * - APP 名称：realAppName / appName / displayName / localizedDisplayName / name
 * - Package：packageName / bundleIdentifier / bundleId / token
 * - 时长：minutes / durationMinutes / totalMinutes / durationSeconds / totalActivitySeconds
 * - 打开次数：pickups / pickupCount / numberOfPickups / opens
 * - 当日合计：screenMinutes / totalScreenMinutes / totalActivityMinutes / totalActivitySeconds
 *
 * mapAppName 由 App.jsx 传入现有 snowballAppNameFor，避免在服务文件中复制匹配词库。
 */
export function normalizeIOSScreenTimePayload(payload = {}, mapAppName = () => '') {
  const rawDays = Array.isArray(payload?.days) ? payload.days : []

  const normalizedDays = rawDays.map((day, dayIndex) => {
    const rawApps = (
      Array.isArray(day?.apps) ? day.apps :
      Array.isArray(day?.applications) ? day.applications :
      Array.isArray(day?.appDetails) ? day.appDetails :
      []
    )

    const apps = rawApps.map((item, appIndex) => {
      const realAppName = String(
        item?.realAppName ??
        item?.appName ??
        item?.displayName ??
        item?.localizedDisplayName ??
        item?.name ??
        ''
      ).trim()

      const packageName = String(
        item?.packageName ??
        item?.bundleIdentifier ??
        item?.bundleId ??
        item?.token ??
        ''
      ).trim()

      const minutesFromSeconds = Number(
        item?.durationSeconds ??
        item?.totalActivitySeconds ??
        0
      ) / 60

      const rawMinutes = Number(
        item?.minutes ??
        item?.durationMinutes ??
        item?.totalMinutes ??
        minutesFromSeconds
      )

      const rawPickups = Number(
        item?.pickups ??
        item?.pickupCount ??
        item?.numberOfPickups ??
        item?.opens ??
        0
      )

      const matchedName = String(mapAppName(realAppName) || '').trim()

      return {
        ...item,
        id: item?.id || `ios-${String(day?.date || dayIndex)}-${packageName || appIndex}`,
        recordType: 'app',
        app: matchedName,
        realAppName,
        packageName,
        mapped: Boolean(matchedName),
        minutes: Number.isFinite(rawMinutes)
          ? Math.max(0, Math.round(rawMinutes))
          : 0,
        pickups: Number.isFinite(rawPickups)
          ? Math.max(0, Math.round(rawPickups))
          : 0,
        autoSource: 'ios-screen-time',
      }
    })

    const totalFromSeconds = Number(
      day?.totalActivitySeconds ??
      day?.screenSeconds ??
      0
    ) / 60

    const explicitTotal = Number(
      day?.screenMinutes ??
      day?.totalScreenMinutes ??
      day?.totalActivityMinutes ??
      totalFromSeconds
    )

    const appSubtotal = apps.reduce(
      (sum, item) => sum + Number(item?.minutes || 0),
      0,
    )

    return {
      ...day,
      date: String(day?.date || ''),
      screenMinutes: Number.isFinite(explicitTotal)
        ? Math.max(0, Math.round(explicitTotal))
        : appSubtotal,
      apps,
      sourcePlatform: 'ios',
    }
  })

  return {
    ...payload,
    platform: 'ios',
    days: normalizedDays,
  }
}

