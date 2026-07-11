import type { IconType } from './types'

// Lucide-style SVG paths (24x24 viewBox)
const ICON_PATHS: Record<IconType, string> = {
  browser: `<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>`,
  person: `<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>`,
  server: `<rect width="20" height="8" x="2" y="2" rx="2"/><rect width="20" height="8" x="2" y="14" rx="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/>`,
  database: `<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>`,
  cloud: `<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>`,
  mobile: `<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>`,
  service: `<path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>`,
  queue: `<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>`,
}

export function iconSVG(type: IconType | undefined, size: number, color: string): string {
  const paths = ICON_PATHS[type ?? 'server']
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`
}

export function iconSVGEmbedded(type: IconType | undefined, cx: number, cy: number, size: number, color: string): string {
  const paths = ICON_PATHS[type ?? 'server']
  const half = size / 2
  // scale from 24x24 viewBox to `size`
  const scale = size / 24
  return `<g transform="translate(${cx - half}, ${cy - half}) scale(${scale})" fill="none" stroke="${color}" stroke-width="${1.75 / scale}" stroke-linecap="round" stroke-linejoin="round">${paths}</g>`
}
