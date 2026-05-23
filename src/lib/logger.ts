type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogMeta {
  [key: string]: unknown
}

function write(level: LogLevel, message: string, meta?: LogMeta): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg: message,
    pid: process.pid,
    ...meta,
  })
  if (level === 'error' || level === 'warn') {
    console.error(line)
  } else {
    console.log(line)
  }
}

const logger = {
  debug: (message: string, meta?: LogMeta) => write('debug', message, meta),
  info: (message: string, meta?: LogMeta) => write('info', message, meta),
  warn: (message: string, meta?: LogMeta) => write('warn', message, meta),
  error: (message: string, meta?: LogMeta) => write('error', message, meta),
}

export default logger
