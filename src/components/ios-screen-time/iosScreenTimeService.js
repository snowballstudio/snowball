import { Capacitor, registerPlugin } from '@capacitor/core'

const IOSScreenTime = registerPlugin('IOSScreenTime')
const DEFAULT_CUTOFF_HOUR = 5
const DEFAULT_MINIMUM_ACTIVITY_SECONDS = 10

export function isIOSScreenTimeAvailable() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'
}

export async function getIOSScreenTimeStatus() {
  if (!isIOSScreenTimeAvailable()) {
    return {
      available: false,
      platform: Capacitor.getPlatform(),
      status: 'unavailable',
      statusLabel: '仅 iPhone 真机可用',
    }
  }

  return IOSScreenTime.getAuthorizationStatus()
}

export async function requestIOSScreenTimeAuthorization() {
  if (!isIOSScreenTimeAvailable()) {
    throw new Error('苹果屏幕时间只能在安装到 iPhone 后授权。')
  }

  return IOSScreenTime.requestAuthorization()
}

export async function openIOSScreenTimeReport(date) {
  if (!isIOSScreenTimeAvailable()) {
    throw new Error('苹果屏幕时间报告只能在 iPhone 真机打开。')
  }

  return IOSScreenTime.presentReport({ date: String(date || '') })
}

function dateKey(value) {
  const text = String(value || '').trim()
  const match = text.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/)
  if (!match) return text
  return `${match[1]}-${String(Number(match[2])).padStart(2, '0')}-${String(Number(match[3])).padStart(2, '0')}`
}

function logicalDayStart(date, cutoffHour = DEFAULT_CUTOFF_HOUR) {
  const key = dateKey(date)
  const match = key.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(cutoffHour || DEFAULT_CUTOFF_HOUR),
    0,
    0,
    0,
  )
}

function timestampMs(value, fallbackDate = '') {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getTime()
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value
  }

  const text = String(value || '').trim()
  if (!text) return null

  const direct = new Date(text)
  if (!Number.isNaN(direct.getTime())) return direct.getTime()

  const clock = text.match(/^(\d{1,2})[:：](\d{2})(?::(\d{2}))?$/)
  const start = logicalDayStart(fallbackDate)
  if (!clock || !start) return null

  const rawHour = Number(clock[1])
  const minute = Number(clock[2])
  const second = Number(clock[3] || 0)
  const dayOffset = rawHour >= 24 ? 1 : rawHour < DEFAULT_CUTOFF_HOUR ? 1 : 0
  const hour = rawHour >= 24 ? rawHour - 24 : rawHour
  const result = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate() + dayOffset,
    hour,
    minute,
    second,
    0,
  )
  return result.getTime()
}

function clockForLogicalDay(timestamp, date, cutoffHour = DEFAULT_CUTOFF_HOUR) {
  const ms = timestampMs(timestamp, date)
  const start = logicalDayStart(date, cutoffHour)
  if (ms === null || !start) return ''

  const point = new Date(ms)
  const baseDate = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  const pointDate = new Date(point.getFullYear(), point.getMonth(), point.getDate())
  const dayDiff = Math.round((pointDate - baseDate) / 86400000)
  const hour = point.getHours() + Math.max(0, dayDiff) * 24
  return `${String(hour).padStart(2, '0')}：${String(point.getMinutes()).padStart(2, '0')}`
}

function secondsFrom(value) {
  const number = Number(value || 0)
  if (!Number.isFinite(number) || number <= 0) return 0
  return Math.round(number)
}

function activitySecondsForHour(hour = {}) {
  if (Number.isFinite(Number(hour.activitySeconds))) return secondsFrom(hour.activitySeconds)
  if (Number.isFinite(Number(hour.totalActivitySeconds))) return secondsFrom(hour.totalActivitySeconds)
  if (Number.isFinite(Number(hour.seconds))) return secondsFrom(hour.seconds)
  if (Number.isFinite(Number(hour.activityMinutes))) return secondsFrom(hour.activityMinutes) * 60
  if (Number.isFinite(Number(hour.minutes))) return secondsFrom(hour.minutes) * 60

  const segments = Array.isArray(hour.segments) ? hour.segments : Array.isArray(hour.activities) ? hour.activities : []
  return segments.reduce((sum, segment) => {
    const start = timestampMs(segment?.startTime || segment?.start)
    const end = timestampMs(segment?.endTime || segment?.end)
    if (start !== null && end !== null && end > start) return sum + Math.round((end - start) / 1000)
    return sum + secondsFrom(segment?.durationSeconds)
  }, 0)
}

function hourStartMs(hour = {}, date = '') {
  return timestampMs(
    hour.hourStart ||
    hour.startTime ||
    hour.start ||
    hour.timestamp,
    date,
  )
}

function longestSegmentEndMs(hour = {}, date = '') {
  const explicit = timestampMs(
    hour.longestActivityEndTime ||
    hour.longestSegmentEndTime,
    date,
  )
  if (explicit !== null) return explicit

  const segments = Array.isArray(hour.segments) ? hour.segments : Array.isArray(hour.activities) ? hour.activities : []
  let longest = null

  segments.forEach(segment => {
    const start = timestampMs(segment?.startTime || segment?.start, date)
    const end = timestampMs(segment?.endTime || segment?.end, date)
    const duration = start !== null && end !== null
      ? end - start
      : secondsFrom(segment?.durationSeconds) * 1000

    if (end !== null && duration > 0 && (!longest || duration > longest.duration)) {
      longest = { duration, end }
    }
  })

  return longest?.end ?? null
}

function pickupTimes(day = {}, lastHour = null) {
  const values = []

  const append = value => {
    const ms = timestampMs(value, day.date)
    if (ms !== null) values.push(ms)
  }

  append(day.lastPickupTime)
  append(day.lastPickUpTime)

  const topLevel = Array.isArray(day.pickups) ? day.pickups : []
  topLevel.forEach(item => append(item?.time || item?.timestamp || item))

  if (lastHour) {
    const hourly = Array.isArray(lastHour.pickups) ? lastHour.pickups : []
    hourly.forEach(item => append(item?.time || item?.timestamp || item))
    append(lastHour.lastPickupTime)
  }

  return values.sort((a, b) => a - b)
}

function maxTimestamp(values = []) {
  const valid = values.filter(value => Number.isFinite(value))
  return valid.length ? Math.max(...valid) : null
}

/**
 * 根据苹果小时短报告推算离机时间。
 *
 * 三个候选值取最晚：
 * 1. 最后一次拿起手机时间 + 最后活动小时内总活动时长；
 * 2. 最后活动小时内最长活动段的结束时间；
 * 3. 用户点击“今日晚安”的时间。
 *
 * 仅扫描逻辑日 05:00 至次日 05:00；
 * 小时活动总量必须严格大于 minimumActivitySeconds（默认10秒）。
 */
export function calculateIOSOffscreenDay(
  day = {},
  {
    goodNightTime = '',
    cutoffHour = DEFAULT_CUTOFF_HOUR,
    minimumActivitySeconds = DEFAULT_MINIMUM_ACTIVITY_SECONDS,
  } = {},
) {
  const date = dateKey(day.date)
  const start = logicalDayStart(date, cutoffHour)
  if (!start) return null
  const end = start.getTime() + 24 * 60 * 60 * 1000

  const hours = (
    Array.isArray(day.hourlyActivity) ? day.hourlyActivity :
    Array.isArray(day.hours) ? day.hours :
    Array.isArray(day.hourlyReports) ? day.hourlyReports :
    []
  )
    .map(hour => ({
      ...hour,
      _startMs: hourStartMs(hour, date),
      _activitySeconds: activitySecondsForHour(hour),
    }))
    .filter(hour =>
      hour._startMs !== null &&
      hour._startMs >= start.getTime() &&
      hour._startMs < end &&
      hour._activitySeconds > Number(minimumActivitySeconds || 10)
    )
    .sort((a, b) => a._startMs - b._startMs)

  const lastHour = hours.at(-1) || null
  const lastHourActivitySeconds = lastHour?._activitySeconds || 0
  const pickups = pickupTimes({ ...day, date }, lastHour)
    .filter(ms => ms >= start.getTime() && ms < end)
  const lastPickupMs = pickups.at(-1) ?? null

  const pickupPlusActivityMs = lastPickupMs !== null
    ? lastPickupMs + lastHourActivitySeconds * 1000
    : null

  const longestActivityEndMs = lastHour
    ? longestSegmentEndMs(lastHour, date)
    : null

  const goodNightMs = timestampMs(goodNightTime, date)
  const calculatedMs = maxTimestamp([
    pickupPlusActivityMs,
    longestActivityEndMs,
    goodNightMs,
  ])

  return {
    date,
    calculatedOffscreenTime: clockForLogicalDay(calculatedMs, date, cutoffHour),
    dataSource: calculatedMs !== null ? '苹果推算' : '',
    androidOffscreenTime: '',
    iosLastLongActivityEnd: clockForLogicalDay(longestActivityEndMs, date, cutoffHour),
    iosLastPickupTime: clockForLogicalDay(lastPickupMs, date, cutoffHour),
    iosLastHourActivityMinutes: lastHourActivitySeconds
      ? Math.round((lastHourActivitySeconds / 60) * 10) / 10
      : 0,
    iosGoodNightTime: goodNightTime || '',
    iosCalculatedOffscreenTime: clockForLogicalDay(calculatedMs, date, cutoffHour),
    iosLastActiveHourStart: clockForLogicalDay(lastHour?._startMs, date, cutoffHour),
    iosLastActiveHourSeconds: lastHourActivitySeconds,
  }
}

export function recalculateIOSOffscreenRecord(
  record = {},
  {
    cutoffHour = DEFAULT_CUTOFF_HOUR,
  } = {},
) {
  const date = dateKey(record.date)
  const lastPickupMs = timestampMs(record.iosLastPickupTime, date)
  const activitySeconds = Number(record.iosLastActiveHourSeconds || 0) ||
    Math.round(Number(record.iosLastHourActivityMinutes || 0) * 60)
  const pickupPlusActivityMs = lastPickupMs !== null && activitySeconds > 0
    ? lastPickupMs + activitySeconds * 1000
    : null
  const longestActivityEndMs = timestampMs(record.iosLastLongActivityEnd, date)
  const goodNightMs = timestampMs(record.iosGoodNightTime, date)
  const calculatedMs = maxTimestamp([
    pickupPlusActivityMs,
    longestActivityEndMs,
    goodNightMs,
  ])

  return {
    ...record,
    calculatedOffscreenTime: clockForLogicalDay(calculatedMs, date, cutoffHour),
    dataSource: calculatedMs !== null ? '苹果推算' : record.dataSource || '',
    iosCalculatedOffscreenTime: clockForLogicalDay(calculatedMs, date, cutoffHour),
  }
}

/**
 * 读取正式苹果屏幕时间数据。
 *
 * 原生 IOSScreenTime 插件需实现 readActivityData(options)，返回：
 * {
 *   days: [{
 *     date,
 *     screenMinutes,
 *     apps: [{ realAppName, packageName, minutes, pickups }],
 *     hourlyActivity: [{
 *       hourStart,
 *       activitySeconds,
 *       pickups: [{ time }],
 *       segments: [{ startTime, endTime }]
 *     }]
 *   }]
 * }
 */
export async function readIOSScreenTimeData({
  startDate,
  days = 1,
  cutoffHour = DEFAULT_CUTOFF_HOUR,
  minimumActivitySeconds = DEFAULT_MINIMUM_ACTIVITY_SECONDS,
} = {}) {
  if (!isIOSScreenTimeAvailable()) {
    throw new Error('苹果屏幕时间数据只能在 iPhone 真机读取。')
  }

  if (typeof IOSScreenTime.readActivityData !== 'function') {
    throw new Error('当前 iOS 原生插件尚未实现 readActivityData。')
  }

  const payload = await IOSScreenTime.readActivityData({
    startDate: String(startDate || ''),
    days: Math.max(1, Math.round(Number(days || 1))),
    cutoffHour: Number(cutoffHour || DEFAULT_CUTOFF_HOUR),
    minimumActivitySeconds: Number(minimumActivitySeconds || DEFAULT_MINIMUM_ACTIVITY_SECONDS),
  })

  const rawDays = Array.isArray(payload?.days) ? payload.days : []
  return {
    ...payload,
    days: rawDays.map(day => ({
      ...day,
      date: dateKey(day?.date),
    })),
  }
}
