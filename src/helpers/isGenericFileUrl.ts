const FILE_EXT =
  /\.(pdf|xlsx?|docx?|pptx?|txt|csv|zip|rar|7z|epub|apk|json|xml|odt|ods)(\?|$)/i

const FILE_HOSTS = [
  'drive.google.com',
  'docs.google.com',
  'dropbox.com',
  'dl.dropboxusercontent.com',
  'mega.nz',
  'mediafire.com',
  'onedrive.live.com',
  '1drv.ms',
  'box.com',
]

export function isGenericFileUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase()
    if (FILE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) {
      return true
    }
    return FILE_EXT.test(parsed.pathname + parsed.search)
  } catch {
    return false
  }
}
