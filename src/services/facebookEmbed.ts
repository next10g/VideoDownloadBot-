import logger from '@/lib/logger'
import {
  facebookEmbedCandidates,
  facebookPhotoCandidates,
  facebookVideoCandidates,
  parseFacebookLinkMeta,
  sanitizeFacebookUrl,
  type FacebookContentKind,
} from '@/services/facebookLinkMeta'
import {
  hrefFromPluginTarget,
  isFacebookShareLink,
  shareDiscoverHrefs,
  sharePluginTargets,
} from '@/services/facebookShareProbe'
import {
  facebookUrlCandidatesFromId,
  fetchFacebookHtml,
  resolveFacebookUrl,
} from '@/services/resolveFacebookUrl'
import { downloadStreamToFile } from '@/services/youtubeStreamDownload'

export interface FacebookStream {
  url: string
  height: number
  label: string
}

export interface FacebookEmbedResult {
  pageUrl: string
  resolvedUrl?: string
  title?: string
  description?: string
  streams: FacebookStream[]
  imageUrl?: string
  contentKind?: FacebookContentKind
}

function unescapeJsonUrl(raw: string): string {
  return raw
    .replace(/\\u0025/g, '%')
    .replace(/\\\//g, '/')
    .replace(/\\"/g, '"')
    .replace(/&amp;/g, '&')
}

function uniqueStreams(streams: FacebookStream[]): FacebookStream[] {
  const seen = new Set<string>()
  const out: FacebookStream[] = []
  for (const s of streams) {
    if (!s.url.startsWith('http') || seen.has(s.url)) {
      continue
    }
    seen.add(s.url)
    out.push(s)
  }
  out.sort((a, b) => b.height - a.height)
  return out
}

function parseStreamsFromHtml(html: string): FacebookStream[] {
  const streams: FacebookStream[] = []

  const hd =
    html.match(/"hd_src(?:_no_ratelimit)?"\s*:\s*"([^"]+)"/i)?.[1] ||
    html.match(/"browser_native_hd_url"\s*:\s*"([^"]+)"/i)?.[1]
  if (hd) {
    streams.push({ url: unescapeJsonUrl(hd), height: 1080, label: '1080p' })
  }

  const sd =
    html.match(/"sd_src(?:_no_ratelimit)?"\s*:\s*"([^"]+)"/i)?.[1] ||
    html.match(/"browser_native_sd_url"\s*:\s*"([^"]+)"/i)?.[1]
  if (sd) {
    streams.push({ url: unescapeJsonUrl(sd), height: 480, label: '480p' })
  }

  for (const match of html.matchAll(
    /"playable_url(?:_quality_hd)?"\s*:\s*"([^"]+)"/gi
  )) {
    streams.push({
      url: unescapeJsonUrl(match[1]),
      height: 360,
      label: '360p',
    })
  }

  const ogVideo = html.match(
    /property=["']og:video(?::url)?["']\s+content=["']([^"']+)["']/i
  )?.[1]
  if (ogVideo?.startsWith('http')) {
    streams.push({ url: ogVideo, height: 360, label: 'video' })
  }

  return uniqueStreams(streams)
}

function scoreImageUrl(url: string): number {
  let score = url.length
  if (/s\d+x\d+/i.test(url)) {
    score -= 5000
  }
  if (/p\d+x\d+/i.test(url)) {
    score -= 3000
  }
  if (/emoji|safe_image|static\.xx/i.test(url)) {
    score -= 10000
  }
  if (/stp=cmp|_nc_cat/i.test(url)) {
    score += 500
  }
  return score
}

function parseImagesFromHtml(html: string): string[] {
  const urls = new Set<string>()

  const push = (raw?: string) => {
    if (!raw?.startsWith('http')) {
      return
    }
    const url = unescapeJsonUrl(raw)
    const isImageCdn =
      (url.includes('scontent') || url.includes('fbcdn.net')) &&
      /\.(jpg|jpeg|png|webp)/i.test(url) &&
      !url.includes('emoji') &&
      !/static\.xx\.fbcdn\.net\/rsrc/i.test(url)
    if (isImageCdn) {
      urls.add(url)
    }
  }

  push(
    html.match(/property=["']og:image["']\s+content=["']([^"']+)["']/i)?.[1]
  )

  for (const match of html.matchAll(
    /"(?:uri|url|src|image_url|full_size_image|viewer_image|photo_image|large_share_image)"\s*:\s*"([^"]+)"/gi
  )) {
    push(unescapeJsonUrl(match[1]))
  }

  for (const match of html.matchAll(
    /"image"\s*:\s*\{\s*"uri"\s*:\s*"([^"]+)"/gi
  )) {
    push(unescapeJsonUrl(match[1]))
  }

  for (const match of html.matchAll(
    /https:\\\/\\\/scontent[^"\\]+/gi
  )) {
    push(match[0])
  }
  for (const match of html.matchAll(
    /https:\/\/scontent[^"'\s\\]+/gi
  )) {
    push(match[0])
  }

  return [...urls].sort((a, b) => scoreImageUrl(b) - scoreImageUrl(a))
}

function parseImageFromHtml(html: string): string | undefined {
  return parseImagesFromHtml(html)[0]
}

function parseTitleFromHtml(html: string): string | undefined {
  return (
    html.match(/property=["']og:title["']\s+content=["']([^"']+)["']/i)?.[1] ||
    html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim()
  )
}

function parseDescriptionFromHtml(html: string): string | undefined {
  return html.match(
    /property=["']og:description["']\s+content=["']([^"']+)["']/i
  )?.[1]
}

function mergeResult(
  base: FacebookEmbedResult | null,
  patch: Partial<FacebookEmbedResult>
): FacebookEmbedResult {
  const imageUrl =
    patch.imageUrl && scoreImageUrl(patch.imageUrl) >= scoreImageUrl(base?.imageUrl || '')
      ? patch.imageUrl
      : base?.imageUrl || patch.imageUrl
  return {
    pageUrl: patch.pageUrl || base?.pageUrl || '',
    resolvedUrl: patch.resolvedUrl || base?.resolvedUrl,
    title: patch.title || base?.title,
    description: patch.description || base?.description,
    streams: uniqueStreams([...(base?.streams || []), ...(patch.streams || [])]),
    imageUrl,
    contentKind: patch.contentKind || base?.contentKind,
  }
}

async function fetchHtml(
  url: string,
  timeoutMs: number,
  mobile = true
): Promise<string> {
  return fetchFacebookHtml(url, timeoutMs, mobile)
}

async function fetchHtmlBestEffort(
  url: string,
  timeoutMs: number
): Promise<string> {
  let lastError: Error | undefined
  for (const mobile of [true, false]) {
    try {
      return await fetchHtml(url, timeoutMs, mobile)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
    }
  }
  throw lastError ?? new Error('fetch failed')
}

function pluginPostUrl(href: string): string {
  return `https://www.facebook.com/plugins/post.php?href=${encodeURIComponent(href)}&show_text=true&width=640`
}

function pluginVideoUrl(href: string): string {
  return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(href)}&show_text=false&width=1280`
}

function htmlTargetsForHref(href: string, kind: FacebookContentKind): string[] {
  const targets = [pluginPostUrl(href), pluginVideoUrl(href)]
  try {
    const u = new URL(href)
    targets.push(
      `https://m.facebook.com${u.pathname}${u.search}`,
      href.replace('www.facebook.com', 'mbasic.facebook.com')
    )
  } catch {
    targets.push(href)
  }
  if (kind === 'photo') {
    return [pluginPostUrl(href), ...targets.filter((t) => !t.includes('video.php'))]
  }
  return targets
}

async function scrapeTargets(
  targets: string[],
  perTargetMs: number,
  pageUrl: string,
  resolvedUrl: string,
  kind: FacebookContentKind
): Promise<FacebookEmbedResult | null> {
  let best: FacebookEmbedResult | null = null

  for (const target of targets) {
    try {
      const html = target.includes('plugins/')
        ? await fetchHtml(target, perTargetMs, true)
        : await fetchHtmlBestEffort(target, perTargetMs)
      const streams = parseStreamsFromHtml(html)
      const images = parseImagesFromHtml(html)
      const imageUrl = images[0]
      const title = parseTitleFromHtml(html)
      const description = parseDescriptionFromHtml(html)

      if (streams.length === 0 && !imageUrl) {
        continue
      }

      const hrefUsed = hrefFromPluginTarget(target) || resolvedUrl
      const patch: FacebookEmbedResult = {
        pageUrl,
        resolvedUrl: hrefUsed,
        title,
        description,
        streams,
        imageUrl,
        contentKind: kind,
      }
      best = mergeResult(best, patch)

      if (streams.length > 0) {
        logger.info('facebook embed probe ok', {
          target: target.slice(0, 120),
          streams: streams.length,
          kind,
          resolvedUrl: hrefUsed,
        })
        return best
      }

      if (imageUrl && (kind === 'photo' || kind === 'post')) {
        logger.info('facebook photo probe ok', {
          target: target.slice(0, 120),
          resolvedUrl: hrefUsed,
        })
        return best
      }
    } catch (error) {
      logger.warn('facebook embed fetch failed', {
        target: target.slice(0, 120),
        detail: error instanceof Error ? error.message : String(error),
      })
    }
  }

  if (best?.imageUrl) {
    logger.info('facebook embed partial (image)', { resolvedUrl, kind })
    return best
  }

  return null
}

/** Meta share links: plugins/post.php + video.php on raw share URL (before photo.php). */
async function probeShareLinksFirst(
  rawUrl: string,
  resolvedUrl: string | undefined,
  timeoutMs: number
): Promise<FacebookEmbedResult | null> {
  const discoverMs = Math.min(10_000, Math.floor(timeoutMs * 0.45))
  const hrefs = await shareDiscoverHrefs(rawUrl, resolvedUrl, discoverMs)
  const targets = sharePluginTargets(hrefs.slice(0, 6))
  const perTargetMs = Math.min(8_000, Math.max(4_000, Math.floor(timeoutMs / Math.max(targets.length, 1))))
  const resolved = hrefs[0] || resolvedUrl || rawUrl

  const result = await scrapeTargets(
    targets,
    perTargetMs,
    rawUrl,
    resolved,
    'post'
  )
  if (result?.imageUrl || (result && result.streams.length > 0)) {
    logger.info('facebook share probe ok', {
      from: rawUrl.slice(0, 90),
      resolvedUrl: result.resolvedUrl,
      hasImage: Boolean(result.imageUrl),
      streams: result.streams.length,
    })
    return result
  }

  logger.warn('facebook share probe miss', {
    rawUrl: rawUrl.slice(0, 90),
    resolvedUrl: resolvedUrl?.slice(0, 90),
    hrefs: hrefs.slice(0, 4),
    targets: targets.length,
  })
  return result
}

async function probePhotoPaths(
  rawUrl: string,
  resolvedUrl: string,
  perTargetMs: number
): Promise<FacebookEmbedResult | null> {
  if (isFacebookShareLink(rawUrl)) {
    const share = await probeShareLinksFirst(rawUrl, resolvedUrl, perTargetMs * 3)
    if (share) {
      return share
    }
  }

  const photoHrefs = facebookPhotoCandidates(rawUrl, resolvedUrl)
  const hrefs =
    photoHrefs.length > 0
      ? photoHrefs
      : facebookEmbedCandidates(rawUrl, resolvedUrl)
  const targets: string[] = []
  for (const href of hrefs.slice(0, 4)) {
    targets.push(...htmlTargetsForHref(href, 'photo'))
  }
  return scrapeTargets(
    [...new Set(targets)].slice(0, 10),
    perTargetMs,
    rawUrl,
    resolvedUrl,
    'photo'
  )
}

async function probeVideoPaths(
  rawUrl: string,
  resolvedUrl: string,
  perTargetMs: number
): Promise<FacebookEmbedResult | null> {
  if (isFacebookShareLink(rawUrl)) {
    const share = await probeShareLinksFirst(rawUrl, resolvedUrl, perTargetMs * 3)
    if (share?.streams.length) {
      return share
    }
  }

  const hrefs = facebookVideoCandidates(rawUrl, resolvedUrl)
  const targets: string[] = []
  for (const href of hrefs.slice(0, 3)) {
    targets.push(pluginVideoUrl(href))
    targets.push(...htmlTargetsForHref(href, 'video').filter((t) => t.includes('video.php')))
  }
  return scrapeTargets(
    [...new Set(targets)].slice(0, 8),
    perTargetMs,
    rawUrl,
    resolvedUrl,
    'video'
  )
}

/** Cookie-less Facebook: share → embed plugins → page HTML (no oEmbed). */
export async function probeFacebookEmbed(
  rawUrl: string,
  timeoutMs = 20_000
): Promise<FacebookEmbedResult | null> {
  const shareLink = isFacebookShareLink(rawUrl)
  const shareBudget = shareLink ? Math.min(12_000, Math.floor(timeoutMs * 0.55)) : 0

  if (shareLink) {
    const instant = await probeShareLinksFirst(rawUrl, undefined, shareBudget)
    if (instant) {
      return instant
    }
  }

  const resolvedRaw = await resolveFacebookUrl(rawUrl)
  const resolvedUrl = sanitizeFacebookUrl(resolvedRaw, rawUrl)

  if (shareLink) {
    const afterResolve = await probeShareLinksFirst(
      rawUrl,
      resolvedUrl,
      Math.max(8_000, shareBudget)
    )
    if (afterResolve) {
      return afterResolve
    }
  }

  const meta = parseFacebookLinkMeta(resolvedUrl)
  const perTargetMs = Math.min(7_000, Math.max(4_000, Math.floor(timeoutMs / 3)))

  const tryPhotoFirst =
    shareLink ||
    meta.kind === 'photo' ||
    meta.kind === 'post' ||
    /\/share\/p\//i.test(rawUrl) ||
    /\/posts\/pfbid/i.test(rawUrl) ||
    /\/posts\/pfbid/i.test(resolvedUrl) ||
    resolvedUrl.includes('photo.php') ||
    resolvedUrl.includes('story.php')

  if (tryPhotoFirst) {
    const photo = await probePhotoPaths(rawUrl, resolvedUrl, perTargetMs)
    if (photo) {
      return photo
    }
  }

  const video = await probeVideoPaths(rawUrl, resolvedUrl, perTargetMs)
  if (video) {
    return video
  }

  if (!tryPhotoFirst) {
    return probePhotoPaths(rawUrl, resolvedUrl, perTargetMs)
  }

  if (shareLink) {
    return probeShareLinksFirst(rawUrl, resolvedUrl, perTargetMs * 4)
  }

  return null
}

/** Last resort for share/p when photo.php path failed. */
export async function probeFacebookShareFallback(
  rawUrl: string,
  resolvedUrl: string,
  timeoutMs: number
): Promise<FacebookEmbedResult | null> {
  if (!isFacebookShareLink(rawUrl)) {
    return null
  }
  return probeShareLinksFirst(rawUrl, resolvedUrl, timeoutMs)
}

export function pickFacebookStream(
  result: FacebookEmbedResult,
  maxHeight: number
): FacebookStream | undefined {
  if (result.streams.length === 0) {
    return undefined
  }
  const sorted = [...result.streams].sort((a, b) => b.height - a.height)
  const fit = sorted.find((s) => s.height <= maxHeight)
  return fit ?? sorted[sorted.length - 1]
}

export async function downloadFacebookDirect(
  streamUrl: string,
  destPath: string,
  timeoutMs: number
): Promise<void> {
  await downloadStreamToFile(
    streamUrl,
    destPath,
    timeoutMs,
    'https://www.facebook.com/'
  )
}

/** Fast retry when yt-dlp returns a numeric id (no full re-resolve). */
export async function probeFacebookByContentId(
  contentId: string,
  rawUrl: string,
  timeoutMs: number
): Promise<FacebookEmbedResult | null> {
  const perTargetMs = Math.min(6_000, Math.floor(timeoutMs / 2))
  const photoResolved = sanitizeFacebookUrl(
    `https://www.facebook.com/photo.php?fbid=${contentId}`,
    rawUrl
  )

  const photo = await probePhotoPaths(rawUrl, photoResolved, perTargetMs)
  if (photo) {
    return { ...photo, pageUrl: rawUrl, resolvedUrl: photoResolved }
  }

  const reelResolved = `https://www.facebook.com/reel/${contentId}`
  const video = await probeVideoPaths(rawUrl, reelResolved, perTargetMs)
  if (video) {
    return { ...video, pageUrl: rawUrl, resolvedUrl: reelResolved }
  }

  return null
}
