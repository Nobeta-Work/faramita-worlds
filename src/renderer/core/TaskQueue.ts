export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'paused' | 'cancelled'

export interface TaskProgress {
  total: number
  completed: number
  current: number
  status: TaskStatus
  startTime: number
  elapsedMs: number
  apiCalls: number
  errors: string[]
}

export interface TaskQueueConfig {
  initialBatchSize: number
  minBatchSize: number
  maxBatchSize: number
  concurrency: number
}

export class TaskQueue<T> {
  private config: TaskQueueConfig
  private _status: TaskStatus = 'pending'
  private progress!: TaskProgress
  private onProgress?: (progress: TaskProgress) => void

  constructor(config?: Partial<TaskQueueConfig>) {
    this.config = {
      initialBatchSize: 8,
      minBatchSize: 4,
      maxBatchSize: 24,
      concurrency: 1,
      ...config
    }
  }

  private get isPaused(): boolean {
    return this._status === 'paused'
  }

  private get isCancelled(): boolean {
    return this._status === 'cancelled'
  }

  private get isRunning(): boolean {
    return this._status === 'running'
  }

  async execute(
    items: T[],
    processor: (batch: T[], batchIndex: number, context: any) => Promise<any[]>,
    onProgress?: (progress: TaskProgress) => void
  ): Promise<{ results: any[]; progress: TaskProgress }> {
    this.onProgress = onProgress
    this._status = 'running'
    const results: any[] = []
    let batchSize = this.config.initialBatchSize
    let batchIndex = 0
    let offset = 0
    const context: any = { existingEntities: [] }

    this.progress = {
      total: items.length,
      completed: 0,
      current: 0,
      status: 'running',
      startTime: Date.now(),
      elapsedMs: 0,
      apiCalls: 0,
      errors: []
    }

    while (offset < items.length && this.isRunning) {
      // 暂停等待
      while (this.isPaused) {
        await new Promise((resolve) => setTimeout(resolve, 200))
      }
      if (this.isCancelled) break

      const batch = items.slice(offset, offset + batchSize)
      this.progress.current = offset
      this.emitProgress()

      try {
        const batchResults = await processor(batch, batchIndex, context)
        results.push(...batchResults)
        batchSize = Math.min(batchSize + 2, this.config.maxBatchSize)
      } catch (err) {
        this.progress.errors.push(`Batch ${batchIndex}: ${err}`)
        batchSize = Math.max(Math.floor(batchSize / 2), this.config.minBatchSize)
      }

      offset += batch.length
      batchIndex++
      this.progress.completed = offset
      this.progress.apiCalls++
      this.progress.elapsedMs = Date.now() - this.progress.startTime
      this.emitProgress()
    }

    this.progress.status = this.isCancelled ? 'cancelled' : 'completed'
    this.emitProgress()
    return { results, progress: this.progress }
  }

  pause() {
    if (this.isRunning) this._status = 'paused'
  }

  resume() {
    if (this.isPaused) this._status = 'running'
  }

  cancel() {
    this._status = 'cancelled'
  }

  getStatus(): TaskStatus {
    return this._status
  }

  private emitProgress() {
    this.progress.elapsedMs = Date.now() - this.progress.startTime
    this.onProgress?.({ ...this.progress })
  }
}
