import { Capacitor, registerPlugin } from '@capacitor/core'

const AndroidPhotoIndex = registerPlugin('AndroidPhotoIndex')

export function isAndroidPhotoIndexAvailable() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

export async function pickAndroidPhotoIndexes() {
  if (!isAndroidPhotoIndexAvailable()) {
    throw new Error('安卓照片索引只在安卓原生版中启用。')
  }

  const result = await AndroidPhotoIndex.pickPhotos()
  return Array.isArray(result?.photos) ? result.photos : []
}

export async function presentAndroidIndexedPhoto(uri) {
  if (!isAndroidPhotoIndexAvailable()) {
    throw new Error('安卓照片索引只在安卓原生版中启用。')
  }

  if (!uri) {
    throw new Error('这张照片没有可用的系统索引。')
  }

  return AndroidPhotoIndex.presentPhoto({ uri })
}
