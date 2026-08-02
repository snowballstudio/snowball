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

export async function presentIOSIndexedPhoto(assetIdentifier) {
  if (!isIOSPhotoIndexAvailable()) {
    throw new Error('照片索引目前只在 iPhone 原生版中启用。')
  }

  if (!assetIdentifier) {
    throw new Error('这张照片没有可用的系统索引。')
  }

  return IOSPhotoIndex.presentPhoto({ assetIdentifier })
}
