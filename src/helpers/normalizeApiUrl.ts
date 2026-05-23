/** Normalize public API base URLs from .env (fixes HTTPS://HOST → https://host). */
export function normalizeApiUrl(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) {
    return ''
  }
  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`
  try {
    const u = new URL(withScheme)
    u.protocol = 'https:'
    const port = u.port && u.port !== '443' ? `:${u.port}` : ''
    return `https://${u.hostname}${port}`.replace(/\/$/, '')
  } catch {
    return trimmed.replace(/\/$/, '').toLowerCase()
  }
}

export function normalizeApiUrlList(urls: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of urls) {
    const base = normalizeApiUrl(raw)
    if (base && !seen.has(base)) {
      seen.add(base)
      out.push(base)
    }
  }
  return out
}

/** Custom entries first, then built-in mirrors not already listed. */
export function mergeApiBases(custom: string[], defaults: string[]): string[] {
  const merged = normalizeApiUrlList(custom)
  const seen = new Set(merged)
  for (const base of defaults) {
    const n = normalizeApiUrl(base)
    if (n && !seen.has(n)) {
      seen.add(n)
      merged.push(n)
    }
  }
  return merged.length > 0 ? merged : defaults.map((b) => normalizeApiUrl(b))
}
