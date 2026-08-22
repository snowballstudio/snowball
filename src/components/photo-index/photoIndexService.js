import { Capacitor, registerPlugin } from '@capacitor/core'
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


const IOSPhotoIndexNative = registerPlugin('IOSPhotoIndex')
const AndroidPhotoIndexNative = registerPlugin('AndroidPhotoIndex')

export async function exportNativeRecordFile(content, fileName) {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('记录文件原生导出只在安装版 APP 中启用。')
  }

  const payload = {
    content: String(content || ''),
    fileName: String(fileName || '雪粒记录.json'),
  }

  const platform = Capacitor.getPlatform()

  if (platform === 'ios') {
    return IOSPhotoIndexNative.exportRecordFile(payload)
  }

  if (platform === 'android') {
    return AndroidPhotoIndexNative.exportRecordFile(payload)
  }

  throw new Error('当前平台无法导出记录文件。')
}

export async function pickNativeRecordFile() {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') {
    throw new Error('记录文件原生选择器只在 iPhone 安装版 APP 中启用。')
  }

  return IOSPhotoIndexNative.pickRecordFile()
}


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

export async function presentIndexedPhoto(
  photo,
  photoGroup = [],
  currentIndex = 0,
) {
  const platform = Capacitor.getPlatform()

  if (platform === 'ios') {
    const indexedPhotos = Array.isArray(photoGroup)
      ? photoGroup.filter(
          item =>
            item
            && typeof item === 'object'
            && item.assetIdentifier,
        )
      : []

    const currentIdentifier = String(
      photo?.assetIdentifier || '',
    )

    let iosIndex = indexedPhotos.findIndex(item => item === photo)

    if (iosIndex < 0 && currentIdentifier) {
      iosIndex = indexedPhotos.findIndex(
        item =>
          String(item?.assetIdentifier || '')
          === currentIdentifier,
      )
    }

    if (iosIndex < 0) {
      iosIndex = Math.max(0, Number(currentIndex || 0))
    }

    return presentIOSIndexedPhoto(
      currentIdentifier,
      indexedPhotos.map(item => item.assetIdentifier),
      iosIndex,
    )
  }

  if (platform === 'android') {
    const indexedPhotos = Array.isArray(photoGroup)
      ? photoGroup.filter(
          item => item && typeof item === 'object' && item.uri,
        )
      : []

    const currentUri = String(photo?.uri || '')
    let androidIndex = indexedPhotos.findIndex(item => item === photo)

    if (androidIndex < 0 && currentUri) {
      androidIndex = indexedPhotos.findIndex(
        item => String(item?.uri || '') === currentUri,
      )
    }

    if (androidIndex < 0) {
      androidIndex = Math.max(0, Number(currentIndex || 0))
    }

    return presentAndroidIndexedPhoto(
      photo,
      indexedPhotos,
      androidIndex,
    )
  }

  throw new Error('当前平台无法打开系统原图。')
}
