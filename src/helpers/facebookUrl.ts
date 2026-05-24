export function isFacebookUrl(url: string): boolean {
  return /(?:^|\/\/)(?:www\.|m\.)?(facebook\.com|fb\.com|fb\.watch)/i.test(url)
}
