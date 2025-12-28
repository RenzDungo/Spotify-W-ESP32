import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
  ],
  server: {
    port: 5500,
    host: true,
    proxy: {
      "/api": {
        target: "http://192.168.1.179:3500",
        changeOrigin: true,
        secure: false,
      },
    },
    allowedHosts: [
      "spotify.balloonhubgaming.com",
    ],
    },
})
