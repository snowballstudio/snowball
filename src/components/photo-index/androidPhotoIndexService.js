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

export async function presentAndroidIndexedPhoto(
  uri,
  uris = [],
  index = 0,
) {
  if (!isAndroidPhotoIndexAvailable()) {
    throw new Error('安卓照片索引只在安卓原生版中启用。')
  }

  const normalizedUris = Array.isArray(uris)
    ? uris.map(value => String(value || '')).filter(Boolean)
    : []

  const currentUri = String(uri || '')
  if (!currentUri && normalizedUris.length === 0) {
    throw new Error('这组照片没有可用的系统索引。')
  }

  return AndroidPhotoIndex.presentPhoto({
    uri: currentUri,
    uris: normalizedUris,
    index: Math.max(0, Number(index || 0)),
  })
}
