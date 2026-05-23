import { DownloadJobModel } from '@/models'
import DownloadJobStatus from '@/models/DownloadJobStatus'
import env from '@/helpers/env'
import downloadUrl from '@/helpers/downloadUrl'
import logger from '@/lib/logger'
import { metrics } from '@/lib/metrics'
import { killAllYtdlpProcesses } from '@/services/ytdlpRunner'
import report from '@/helpers/report'

export interface QueueStats {
  pending: number
  running: boolean
  currentJobId: string | null
  processedTotal: number
  failedTotal: number
  recoveredTotal: number
  lastError: string | null
  lastFinishedAt: number | null
  estimatedWaitSeconds: number
}

class DownloadQueue {
  private readonly pending = new Set<string>()
  private readonly retries = new Map<string, number>()
  private running = false
  private currentJobId: string | null = null
  private jobTimer: NodeJS.Timeout | null = null
  private processedTotal = 0
  private failedTotal = 0
  private recoveredTotal = 0
  private lastError: string | null = null
  private lastFinishedAt: number | null = null

  enqueue(jobId: string): void {
    if (this.pending.size > 0 || this.running) {
      metrics.increment('queueWaits')
    }
    this.pending.add(jobId)
    logger.info('queue enqueue', { jobId, pending: this.pending.size })
    void this.drain()
  }

  getEstimatedWaitSeconds(): number {
    const ahead = this.pending.size + (this.running ? 1 : 0)
    return Math.max(0, ahead * env.AVG_JOB_DURATION_SECONDS)
  }

  getStats(): QueueStats {
    return {
      pending: this.pending.size,
      running: this.running,
      currentJobId: this.currentJobId,
      processedTotal: this.processedTotal,
      failedTotal: this.failedTotal,
      recoveredTotal: this.recoveredTotal,
      lastError: this.lastError,
      lastFinishedAt: this.lastFinishedAt,
      estimatedWaitSeconds: this.getEstimatedWaitSeconds(),
    }
  }

  get size(): number {
    return this.pending.size + (this.running ? 1 : 0)
  }

  cancelCurrentJob(): void {
    if (this.jobTimer) {
      clearTimeout(this.jobTimer)
      this.jobTimer = null
    }
    killAllYtdlpProcesses()
  }

  private async drain(): Promise<void> {
    if (this.running) {
      return
    }
    this.running = true

    while (this.pending.size > 0) {
      const jobId = this.pending.values().next().value as string
      this.pending.delete(jobId)
      this.currentJobId = jobId

      try {
        const downloadJob = await DownloadJobModel.findById(jobId)
        if (
          !downloadJob ||
          downloadJob.status !== DownloadJobStatus.downloading
        ) {
          continue
        }

        this.jobTimer = setTimeout(() => {
          logger.error('queue job timeout', { jobId })
          this.lastError = `Job ${jobId} exceeded queue timeout`
          this.cancelCurrentJob()
        }, env.QUEUE_JOB_TIMEOUT_MS)
        this.jobTimer.unref()

        await downloadUrl(downloadJob)
        this.processedTotal++
        this.lastFinishedAt = Date.now()
        this.retries.delete(jobId)
      } catch (error) {
        this.failedTotal++
        this.lastError =
          error instanceof Error ? error.message : String(error)
        report(error, { location: 'downloadQueue', meta: jobId })
        await this.maybeRecover(jobId)
      } finally {
        if (this.jobTimer) {
          clearTimeout(this.jobTimer)
          this.jobTimer = null
        }
        this.currentJobId = null
      }
    }

    this.running = false
  }

  private async maybeRecover(jobId: string): Promise<void> {
    const attempts = this.retries.get(jobId) ?? 0
    if (attempts >= env.QUEUE_MAX_RETRIES) {
      return
    }
    const job = await DownloadJobModel.findById(jobId)
    if (!job || job.status !== DownloadJobStatus.downloading) {
      return
    }
    this.retries.set(jobId, attempts + 1)
    this.recoveredTotal++
    logger.warn('queue auto-recovery', { jobId, attempt: attempts + 1 })
    this.pending.add(jobId)
  }
}

const downloadQueue = new DownloadQueue()

export default downloadQueue
