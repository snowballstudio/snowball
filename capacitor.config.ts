import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.snowball.health',
  appName: '雪粒',
  webDir: 'dist',
  ios: {
    contentInset: 'always',
  },
}

export default config