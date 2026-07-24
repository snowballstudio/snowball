import { Capacitor, registerPlugin } from '@capacitor/core'

const IOSAudioSession = registerPlugin('IOSAudioSession')

export async function restoreIOSPlaybackAudioSession() {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') {
    return { restored: false, platform: Capacitor.getPlatform() }
  }

  return IOSAudioSession.restorePlayback()
}
