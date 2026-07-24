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
