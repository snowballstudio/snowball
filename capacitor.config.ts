import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.snowball.health',
  appName: '雪粒',
  webDir: 'dist',
  ios: {
    contentInset: 'never',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1800,
      launchAutoHide: true,
      showSpinner: false,
      backgroundColor: '#ffffff',
    },
  },
}

export default config