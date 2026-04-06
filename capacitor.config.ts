import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.fedejaramilloo.agrogestion',
  appName: 'Agrogestion',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
