export function isFacebookUrl(url: string): boolean {
  return /(?:^|\/\/)(?:[\w-]+\.)*(facebook\.com|fb\.com|fb\.watch)/i.test(url)
}
