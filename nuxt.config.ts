// InovaOS — configuración Nuxt
//
// Modo SPA (ssr:false) a propósito: la sesión vive en localStorage y toda la
// data se pide al backend existente con headers Authorization + X-Company.
// Con SSR habría que rehacer el modelo de autenticación; en SPA se porta tal cual.
export default defineNuxtConfig({
  ssr: false,

  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@vueuse/nuxt',
    '@pinia/nuxt',
    '@vite-pwa/nuxt'
  ],

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  // La URL del backend se inyecta por entorno (NUXT_PUBLIC_API_BASE) y nunca
  // se escribe en el repositorio. Vacia = ruta relativa /api, que en desarrollo
  // resuelve el proxy de Vite de mas abajo.
  runtimeConfig: {
    public: {
      apiBase: ''
    }
  },

  app: {
    head: {
      title: 'InovaOS',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'theme-color', content: '#0096D5' }
      ],
      // La marca es oscura, asi que se sirve una variante blanca para las
      // barras de pestanas en tema oscuro; ahi la version oscura desaparece.
      // El .ico queda de respaldo para navegadores que ignoran `media`.
      link: [
        { rel: 'icon', href: '/favicon.ico', sizes: 'any' },
        { rel: 'icon', type: 'image/png', href: '/favicon-claro.png', media: '(prefers-color-scheme: light)' },
        { rel: 'icon', type: 'image/png', href: '/favicon-oscuro.png', media: '(prefers-color-scheme: dark)' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' }
      ]
    }
  },

  // En desarrollo el proxy evita CORS contra el backend local (IIS, puerto 7002).
  // En producción el rewrite de Vercel manda /api/* al backend público.
  vite: {
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:7002',
          changeOrigin: true
        }
      }
    }
  },

  // PWA: mismo manifiesto e iconos que el portal actual. `importScripts`
  // inyecta los manejadores de Web Push (push / notificationclick) en el
  // service worker generado, conservando precache y auto-actualización.
  pwa: {
    registerType: 'autoUpdate',
    includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
    manifest: {
      name: 'InovaOS',
      short_name: 'InovaOS',
      description: 'InovaOS — CRM, Tesorería, Recursos Humanos, Logística e Ingeniería',
      lang: 'es',
      theme_color: '#0096D5',
      background_color: '#ffffff',
      display: 'standalone',
      scope: '/',
      start_url: '/',
      icons: [
        { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
        { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
      ]
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
      cleanupOutdatedCaches: true,
      importScripts: ['/push-sw.js'],
      // El login y la sesión nunca se cachean: siempre contra el backend.
      runtimeCaching: [
        {
          urlPattern: /\/api\/auth\//,
          handler: 'NetworkOnly'
        },
        {
          urlPattern: /\/api\//,
          handler: 'NetworkFirst',
          options: {
            cacheName: 'api-portal',
            networkTimeoutSeconds: 5
          }
        }
      ]
    },
    devOptions: {
      enabled: false
    }
  },

  compatibilityDate: '2026-06-30',

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})
