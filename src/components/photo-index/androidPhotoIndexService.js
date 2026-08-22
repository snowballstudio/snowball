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

function normalizeAndroidPhotoRef(photo) {
  const item = photo && typeof photo === 'object' ? photo : {}
  return {
    uri: String(item.uri || ''),
    assetKey: String(item.assetKey || ''),
    mediaStoreId: String(item.mediaStoreId || ''),
  }
}

export async function presentAndroidIndexedPhoto(
  photo,
  photoGroup = [],
  index = 0,
) {
  if (!isAndroidPhotoIndexAvailable()) {
    throw new Error('安卓照片索引只在安卓原生版中启用。')
  }

  const refs = Array.isArray(photoGroup)
    ? photoGroup
        .filter(item => item && typeof item === 'object')
        .map(normalizeAndroidPhotoRef)
        .filter(item => item.uri || item.assetKey || item.mediaStoreId)
    : []

  const current = normalizeAndroidPhotoRef(photo)

  if (!current.uri && !current.assetKey && !current.mediaStoreId && refs.length === 0) {
    throw new Error('这组照片没有可用的系统索引。')
  }

  return AndroidPhotoIndex.presentPhoto({
    uri: current.uri,
    assetKey: current.assetKey,
    mediaStoreId: current.mediaStoreId,
    uris: refs.map(item => item.uri),
    assetKeys: refs.map(item => item.assetKey),
    mediaStoreIds: refs.map(item => item.mediaStoreId),
    index: Math.max(0, Number(index || 0)),
  })
}
