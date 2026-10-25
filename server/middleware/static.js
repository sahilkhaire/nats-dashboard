/**
 * Static file serving for the production build (dist/ directory).
 * Unknown extension-less paths fall back to index.html for client-side routing.
 */

import { readFileSync, existsSync, statSync } from 'fs'
import { join, extname, resolve, sep } from 'path'

const MIME = {
  '.html':  'text/html; charset=utf-8',
  '.js':    'application/javascript',
  '.css':   'text/css',
  '.json':  'application/json',
  '.ico':   'image/x-icon',
  '.svg':   'image/svg+xml',
  '.png':   'image/png',
  '.jpg':   'image/jpeg',
  '.woff':  'font/woff',
  '.woff2': 'font/woff2',
}

export function createStaticHandler(distDir) {
  const root = resolve(distDir)
  const indexPath = join(root, 'index.html')

  const isFile = (p) => {
    try { return statSync(p).isFile() } catch { return false }
  }

  return function serveStatic(pathname, res) {
    let decoded
    try { decoded = decodeURIComponent(pathname) } catch { return false }
    let filePath = resolve(root, `.${decoded === '/' ? '/index.html' : decoded}`)
    if (filePath !== root && !filePath.startsWith(root + sep)) return false

    if (!isFile(filePath)) {
      if (extname(filePath)) return false
      filePath = indexPath
    }
    if (!existsSync(filePath)) return false

    const ext = extname(filePath)
    res.statusCode = 200
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream')
    // Vite fingerprints everything under /assets — cache those hard, never cache the shell.
    res.setHeader('Cache-Control', decoded.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache')
    res.end(readFileSync(filePath))
    return true
  }
}
