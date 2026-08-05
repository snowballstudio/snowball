import { Capacitor, registerPlugin } from '@capacitor/core'

const IOSScreenTime = registerPlugin('IOSScreenTime')

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


export async function showIOSHomeMiniReport(rect = {}) {
  if (!isIOSScreenTimeAvailable()) return { shown: false }

  return IOSScreenTime.showHomeMiniReport({
    x: Number(rect.x || 0),
    y: Number(rect.y || 0),
    width: Number(rect.width || 180),
    height: Number(rect.height || 26),
  })
}

export async function hideIOSHomeMiniReport() {
  if (!isIOSScreenTimeAvailable()) return { hidden: false }
  return IOSScreenTime.hideHomeMiniReport()
}

export async function openIOSScreenTimeDashboard() {
  if (!isIOSScreenTimeAvailable()) {
    throw new Error('苹果屏幕时间总览只能在 iPhone 真机打开。')
  }

  return IOSScreenTime.presentDashboardReport()
}

export async function openIOSSevenDayDailyTable() {
  if (!isIOSScreenTimeAvailable()) {
    throw new Error('苹果七日屏幕时间表只能在 iPhone 真机打开。')
  }

  return IOSScreenTime.presentSevenDayDailyTable()
}



function normalizedClockMinutes(value) {
  const text = String(value || '')
    .trim()
    .replace(/：/g, ':')

  const match = text.match(/^(\d{1,2}):([0-5]\d)$/)
  if (!match) return null

  return Number(match[1]) * 60 + Number(match[2])
}

function formattedClock(value) {
  const text = String(value || '')
    .trim()
    .replace(/：/g, ':')

  const match = text.match(/^(\d{1,2}):([0-5]\d)$/)
  if (!match) return ''

  return `${String(Number(match[1])).padStart(2, '0')}：${match[2]}`
}

/**
 * 离机时间统一计算：
 * - 安卓手机系统离机时间
 * - 用户道晚安时间
 * - 通话识别的休息时间
 *
 * 空值不参与，三个来源永远取最晚。
 * 手动修改日常表不经过本函数，因此仍完全尊重用户手写结果。
 */
export function recalculateOffscreenRecord(record = {}) {
  const candidates = [
    {
      time: record.androidOffscreenTime,
      source: '安卓手机',
    },
    {
      time: record.goodNightTime,
      source: '道晚安',
    },
    {
      time: record.spokenRestTime,
      source: '通话',
    },
  ]
    .map(item => ({
      ...item,
      minutes: normalizedClockMinutes(item.time),
    }))
    .filter(item => item.minutes !== null)

  if (!candidates.length) {
    return {
      ...record,
      calculatedOffscreenTime: '',
      dataSource: '',
    }
  }

  const latest = candidates.reduce((best, item) =>
    !best || item.minutes >= best.minutes ? item : best
  , null)

  return {
    ...record,
    calculatedOffscreenTime: formattedClock(latest.time),
    dataSource: latest.source,
  }
}

export async function startIOSMonitorMiniTest() {
  if (!isIOSScreenTimeAvailable()) {
    throw new Error('Monitor最小测试只能在iPhone真机运行。')
  }
  return IOSScreenTime.startMonitorMiniTest()
}

export async function readIOSMonitorMiniStatus() {
  if (!isIOSScreenTimeAvailable()) {
    throw new Error('Monitor系统状态只能在iPhone真机读取。')
  }
  return IOSScreenTime.readMonitorMiniStatus()
}

export async function readIOSMonitorMiniCallbacks() {
  if (!isIOSScreenTimeAvailable()) {
    throw new Error('Monitor回调只能在iPhone真机读取。')
  }
  return IOSScreenTime.readMonitorMiniCallbacks()
}

export async function stopIOSMonitorMiniTest() {
  if (!isIOSScreenTimeAvailable()) {
    throw new Error('Monitor最小测试只能在iPhone真机停止。')
  }
  return IOSScreenTime.stopMonitorMiniTest()
}
