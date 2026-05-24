import { normalizeUrl } from '@/services/urlNormalize'

/** Meta mobile "Copy link" — almost always /share/p|v|r|… */
export function isFacebookShareLink(url: string): boolean {
  return /facebook\.com\/share\//i.test(url) || /\bfb\.watch\b/i.test(url)
}

export function sharePluginPostUrl(href: string): string {
  return `https://www.facebook.com/plugins/post.php?href=${encodeURIComponent(href)}&show_text=true&width=640`
}

export function sharePluginVideoUrl(href: string): string {
  return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(href)}&show_text=false&width=1280`
}

/** Hrefs to pass into plugins/post.php — raw share URL always first. */
export function shareEmbedHrefs(rawUrl: string, resolvedUrl?: string): string[] {
  const out: string[] = []
  const push = (u?: string) => {
    if (!u?.trim()) {
      return
    }
    try {
      out.push(normalizeUrl(u.trim()))
    } catch {
      // skip
    }
  }

  push(rawUrl)
  push(resolvedUrl)

  if (resolvedUrl && /\/groups\/\d+\/permalink\//i.test(resolvedUrl)) {
    push(resolvedUrl.replace('www.facebook.com', 'm.facebook.com'))
  }

  return [...new Set(out)]
}

export function sharePluginTargets(hrefs: string[]): string[] {
  const targets: string[] = []
  for (const href of hrefs) {
    targets.push(sharePluginPostUrl(href))
    targets.push(sharePluginVideoUrl(href))
  }
  return targets
}

export function hrefFromPluginTarget(target: string): string | undefined {
  const match = target.match(/[?&]href=([^&]+)/i)
  if (!match?.[1]) {
    return undefined
  }
  try {
    return decodeURIComponent(match[1])
  } catch {
    return undefined
  }
}
