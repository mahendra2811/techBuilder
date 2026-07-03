import type { MetadataRoute } from 'next';

/**
 * PWA web app manifest (served at /manifest.webmanifest, linked automatically).
 * No service worker on purpose — the app is online-required v1, and Chrome's
 * installability criteria need only a valid manifest + icons + HTTPS.
 * Icons are generated placeholders (brand-blue "tB") — replace with the
 * merchant's logo at onboarding.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'techBuilder',
    short_name: 'techBuilder',
    description: 'Daily field records for construction SMBs',
    start_url: '/',
    display: 'standalone',
    background_color: '#1A5276',
    theme_color: '#1A5276',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
