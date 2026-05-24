import { normalizeUrl } from '@/services/urlNormalize'

export type FacebookContentKind = 'photo' | 'video' | 'post' | 'unknown'

export interface FacebookLinkMeta {
  kind: FacebookContentKind
  storyFbid?: string
  pageId?: string
  photoFbid?: string
  pfbid?: string
  videoId?: string
  groupId?: string
  permalinkId?: string
}

export function parseFacebookLinkMeta(url: string): FacebookLinkMeta {
  const meta: FacebookLinkMeta = { kind: 'unknown' }
  try {
    const u = new URL(url)
    const path = u.pathname.toLowerCase()

    const pfbid = path.match(/\/(pfbid[A-Za-z0-9]+)/i)?.[1]
    if (pfbid) {
      meta.pfbid = pfbid
      meta.kind = 'photo'
    } else if (/\/share\/p\//i.test(url) || path.includes('photo.php') || path === '/photo/') {
      meta.kind = 'photo'
    } else if (
      /\/share\/[rv]\//i.test(url) ||
      path.includes('/reel/') ||
      path.includes('/watch') ||
      path.includes('video.php')
    ) {
      meta.kind = 'video'
    } else if (path.includes('story.php')) {
      meta.kind = 'photo'
    } else if (path.includes('/groups/') || /\/posts\//i.test(path)) {
      meta.kind = 'post'
    }

    meta.storyFbid = u.searchParams.get('story_fbid') || undefined
    meta.pageId = u.searchParams.get('id') || undefined
    meta.photoFbid =
      u.searchParams.get('fbid') || meta.storyFbid || undefined

    const reel = path.match(/\/reel\/(\d+)/)?.[1]
    const watch = u.searchParams.get('v')
    meta.videoId = reel || watch || undefined

    const group = path.match(/\/groups\/(\d+)/)?.[1]
    meta.groupId = group
    meta.permalinkId =
      path.match(/\/permalink\/(\d+)/)?.[1] ||
      path.match(/\/posts\/(\d+)/)?.[1]
  } catch {
    // keep unknown
  }
  return meta
}

/** Strip tracking params; map story/share/p to photo.php (works with embed). */
export function sanitizeFacebookUrl(
  url: string,
  rawHint?: string
): string {
  try {
    const u = new URL(url)
    u.searchParams.delete('rdid')
    u.searchParams.delete('share_url')
    u.searchParams.delete('post_id')
    u.searchParams.delete('ref')
    u.searchParams.delete('__cft__')
    u.searchParams.delete('__tn__')

    const storyFbid = u.searchParams.get('story_fbid')
    const pageId = u.searchParams.get('id')
    const isPhotoShare =
      Boolean(rawHint?.includes('/share/p/')) ||
      u.pathname.includes('story.php')

    if (storyFbid && isPhotoShare) {
      const photo = new URL('https://www.facebook.com/photo.php')
      photo.searchParams.set('fbid', storyFbid)
      if (pageId) {
        photo.searchParams.set('id', pageId)
      }
      return normalizeUrl(photo.toString())
    }

    if (metaIsVideo(u)) {
      const reel = u.pathname.match(/\/reel\/(\d+)/)?.[1]
      const v = u.searchParams.get('v')
      if (reel) {
        return normalizeUrl(`https://www.facebook.com/reel/${reel}`)
      }
      if (v) {
        return normalizeUrl(`https://www.facebook.com/watch/?v=${v}`)
      }
    }

    return normalizeUrl(u.toString())
  } catch {
    return url
  }
}

function metaIsVideo(u: URL): boolean {
  return (
    u.pathname.includes('/reel/') ||
    u.pathname.includes('/watch') ||
    u.searchParams.has('v')
  )
}

/** Ordered permalinks to try for embed scraping (fast list, no oEmbed). */
export function facebookEmbedCandidates(
  rawUrl: string,
  resolvedUrl: string
): string[] {
  const meta = parseFacebookLinkMeta(resolvedUrl)
  const clean = sanitizeFacebookUrl(resolvedUrl, rawUrl)
  const out: string[] = []

  const push = (href?: string) => {
    if (!href) {
      return
    }
    try {
      out.push(normalizeUrl(href))
    } catch {
      // skip
    }
  }

  push(clean)
  push(resolvedUrl)
  if (rawUrl !== resolvedUrl) {
    push(sanitizeFacebookUrl(rawUrl, rawUrl))
  }

  if (meta.photoFbid) {
    push(`https://www.facebook.com/photo.php?fbid=${meta.photoFbid}`)
    if (meta.pageId) {
      push(
        `https://www.facebook.com/photo.php?fbid=${meta.photoFbid}&id=${meta.pageId}`
      )
    }
    push(`https://www.facebook.com/photo/?fbid=${meta.photoFbid}`)
  }

  if (meta.storyFbid && meta.pageId) {
    push(
      `https://www.facebook.com/story.php?story_fbid=${meta.storyFbid}&id=${meta.pageId}`
    )
  }

  if (meta.videoId) {
    push(`https://www.facebook.com/reel/${meta.videoId}`)
    push(`https://www.facebook.com/watch/?v=${meta.videoId}`)
  }

  if (meta.groupId && meta.permalinkId) {
    push(
      `https://www.facebook.com/groups/${meta.groupId}/permalink/${meta.permalinkId}`
    )
  }

  if (meta.pfbid) {
    try {
      const u = new URL(resolvedUrl)
      const pageSlug = u.pathname.split('/posts/')[0]
      if (pageSlug) {
        push(`https://www.facebook.com${pageSlug}/posts/${meta.pfbid}`)
      }
    } catch {
      // skip
    }
    push(resolvedUrl)
  }

  return [...new Set(out)]
}

export function facebookPhotoCandidates(
  rawUrl: string,
  resolvedUrl: string
): string[] {
  return facebookEmbedCandidates(rawUrl, resolvedUrl).filter(
    (u) =>
      /photo\.php|photo\/|story\.php|share\/p\/|\/posts\/pfbid/i.test(u) ||
      parseFacebookLinkMeta(u).kind === 'photo'
  )
}

export function facebookVideoCandidates(
  rawUrl: string,
  resolvedUrl: string
): string[] {
  return facebookEmbedCandidates(rawUrl, resolvedUrl).filter(
    (u) =>
      /reel\/|watch|video\.php|share\/[rv]\//i.test(u) ||
      parseFacebookLinkMeta(u).kind === 'video'
  )
}
