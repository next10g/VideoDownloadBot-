import { filterSocialImageUrls } from '@/helpers/filterSocialImageUrls'
import { isInstagramUrl } from '@/helpers/instagramUrl'
import { extractAlbumImageUrls } from '@/services/albumExtract'
import type { YtDlpMetadata } from '@/services/ytdlpTypes'

/** Pull direct image URLs from yt-dlp metadata + embed fallback. */
export async function collectImageUrlsFromInfo(
  info: YtDlpMetadata,
  pageUrl: string
): Promise<string[]> {
  const urls = new Set<string>(extractAlbumImageUrls(info))

  if (urls.size === 0 && info.thumbnails?.length) {
    const thumb = info.thumbnails[info.thumbnails.length - 1]?.url
    if (thumb) {
      urls.add(thumb)
    }
  }

  if (urls.size === 0) {
    const raw = JSON.stringify(info)
    const patterns = [
      /https:\/\/[^"\\]+?(?:cdninstagram|fbcdn)[^"\\]*/gi,
      /https:\/\/[^"\\]+?\.(?:jpg|jpeg|webp|png)[^"\\]*/gi,
    ]
    for (const re of patterns) {
      let match: RegExpExecArray | null
      while ((match = re.exec(raw))) {
        const u = match[0].replace(/\\u0026/g, '&').replace(/\\\//g, '/')
        if (/cdninstagram|fbcdn/i.test(u)) {
          urls.add(u)
        }
      }
    }
  }

  if (urls.size === 0 && isInstagramUrl(pageUrl)) {
    const { scrapeAllInstagramImages } = await import('@/helpers/instagramScrape')
    const scraped = await scrapeAllInstagramImages(pageUrl)
    for (const u of scraped) {
      urls.add(u)
    }
  }

  return filterSocialImageUrls([...urls], pageUrl)
}
