/** Load undici from npm (Hostinger Node 20 has no built-in node:undici). */
export function loadUndici(): {
  Agent: new (opts: {
    connectTimeout: number
    headersTimeout: number
    bodyTimeout: number
  }) => unknown
  setGlobalDispatcher?: (d: unknown) => void
} | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('undici') as {
      Agent: new (opts: {
        connectTimeout: number
        headersTimeout: number
        bodyTimeout: number
      }) => unknown
      setGlobalDispatcher: (d: unknown) => void
    }
  } catch {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('node:undici') as {
        Agent: new (opts: {
          connectTimeout: number
          headersTimeout: number
          bodyTimeout: number
        }) => unknown
        setGlobalDispatcher: (d: unknown) => void
      }
    } catch {
      return undefined
    }
  }
}

export function createFetchAgent(timeoutMs: number): unknown | undefined {
  const undici = loadUndici()
  if (!undici) {
    return undefined
  }
  return new undici.Agent({
    connectTimeout: timeoutMs,
    headersTimeout: timeoutMs,
    bodyTimeout: timeoutMs,
  })
}
