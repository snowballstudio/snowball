import { Capacitor } from '@capacitor/core'
import {
  isIOSPhotoIndexAvailable,
  pickIOSPhotoIndexes,
  presentIOSIndexedPhoto,
} from './iosPhotoIndexService.js'
import {
  isAndroidPhotoIndexAvailable,
  pickAndroidPhotoIndexes,
  presentAndroidIndexedPhoto,
} from './androidPhotoIndexService.js'

export function isPhotoIndexAvailable() {
  return isIOSPhotoIndexAvailable() || isAndroidPhotoIndexAvailable()
}

export async function pickPhotoIndexes() {
  const platform = Capacitor.getPlatform()

  if (platform === 'ios') {
    return pickIOSPhotoIndexes()
  }

  if (platform === 'android') {
    return pickAndroidPhotoIndexes()
  }

  throw new Error('照片索引只在 iPhone 和安卓原生版中启用。')
}

export async function presentIndexedPhoto(photo) {
  const platform = Capacitor.getPlatform()

  if (platform === 'ios') {
    return presentIOSIndexedPhoto(photo?.assetIdentifier)
  }

  if (platform === 'android') {
    return presentAndroidIndexedPhoto(photo?.uri)
  }

  throw new Error('当前平台无法打开系统原图。')
}
