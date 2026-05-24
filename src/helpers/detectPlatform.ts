export function detectPlatform(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase()
    if (host.includes('youtube.com') || host === 'youtu.be') {
      return 'youtube'
    }
    if (host.includes('tiktok.com') || host === 'vm.tiktok.com') {
      return 'tiktok'
    }
    if (host.includes('facebook.com') || host === 'fb.watch' || host === 'fb.com') {
      return 'facebook'
    }
    if (host.includes('instagram.com')) {
      return 'instagram'
    }
    if (host.includes('twitter.com') || host === 'x.com') {
      return 'twitter'
    }
    if (host.includes('telegram.')) {
      return 'telegram'
    }
    return host.split('.').slice(-2).join('.') || 'unknown'
  } catch {
    return 'unknown'
  }
}
