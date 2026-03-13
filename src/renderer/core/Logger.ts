import { db } from '../db/db'
import type { EventLogEntry } from '../db/db'

export type LogCategory = 'AI' | 'DATA' | 'IO' | 'SKILL' | 'SYSTEM'
export type LogLevel = EventLogEntry['level']

export class Logger {
  static async log(
    category: LogCategory,
    level: LogLevel,
    code: string,
    message: string,
    context?: any
  ): Promise<void> {
    try {
      await db.event_log.add({
        timestamp: Date.now(),
        category,
        level,
        code,
        message,
        context
      })
    } catch (error) {
      console.error('[Logger] Failed to persist event log:', error)
    }

    const prefix = `[${category}_${code}]`
    if (level === 'error') {
      console.error(prefix, message, context || '')
    } else if (level === 'warn') {
      console.warn(prefix, message, context || '')
    } else {
      console.log(prefix, message, context || '')
    }
  }

  static async list(limit: number = 100): Promise<EventLogEntry[]> {
    return db.event_log.orderBy('timestamp').reverse().limit(limit).toArray()
  }

  static async clear(): Promise<void> {
    await db.event_log.clear()
  }
}
