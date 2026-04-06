import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Solo usamos rutas relativas para la app móvil para evitar la pantalla negra.
  // Esto no afecta a la web en producción (Vercel).
  base: process.env.CAPACITOR_BUILD === 'true' ? './' : '/',
})
