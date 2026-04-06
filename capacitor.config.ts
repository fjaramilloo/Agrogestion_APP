import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.fedejaramilloo.agrogestion',
  appName: 'Agrogestion',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    CapacitorUpdater: {
      autoUpdate: true,
      statsUrl: "https://capgo.app/api/stats",
      resetWhenUpdateFailed: true
    }
  }
};

export default config;
