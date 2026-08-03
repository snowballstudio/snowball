import { Capacitor, registerPlugin } from '@capacitor/core'

const IOSPhotoIndex = registerPlugin('IOSPhotoIndex')

export function isIOSPhotoIndexAvailable() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'
}

export async function pickIOSPhotoIndexes() {
  if (!isIOSPhotoIndexAvailable()) {
    throw new Error('照片索引目前只在 iPhone 原生版中启用。')
  }

  const result = await IOSPhotoIndex.pickPhotos()
  return Array.isArray(result?.photos) ? result.photos : []
}

export async function presentIOSIndexedPhoto(
  assetIdentifier,
  assetIdentifiers = [],
  currentIndex = 0,
) {
  if (!isIOSPhotoIndexAvailable()) {
    throw new Error('照片索引目前只在 iPhone 原生版中启用。')
  }

  const normalizedIdentifiers = Array.isArray(assetIdentifiers)
    ? assetIdentifiers.map(value => String(value || '')).filter(Boolean)
    : []

  const currentIdentifier = String(assetIdentifier || '')
  if (!currentIdentifier && normalizedIdentifiers.length === 0) {
    throw new Error('这组照片没有可用的系统索引。')
  }

  return IOSPhotoIndex.presentPhoto({
    assetIdentifier: currentIdentifier,
    assetIdentifiers: normalizedIdentifiers,
    currentIndex: Math.max(0, Number(currentIndex || 0)),
  })
}
