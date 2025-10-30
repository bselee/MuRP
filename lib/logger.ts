// lib/logger.ts
// Structured logging utility

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  level: LogLevel
  message: string
  timestamp: string
  context?: string
  metadata?: any
  error?: {
    name: string
    message: string
    stack?: string
  }
}

class Logger {
  private context?: string
  private isDevelopment: boolean
  
  constructor(context?: string) {
    this.context = context
    // Use NODE_ENV for both dev and test environments
    this.isDevelopment = process.env.NODE_ENV !== 'production'
  }
  
  private log(level: LogLevel, message: string, metadata?: any) {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context: this.context,
      metadata,
    }
    
    // Only log to console in development or for errors/warnings
    if (!this.isDevelopment && level === 'debug') {
      return
    }
    
    const output = JSON.stringify(entry)
    
    switch (level) {
      case 'debug':
        console.debug(output)
        break
      case 'info':
        if (this.isDevelopment) {
          console.info(output)
        }
        break
      case 'warn':
        console.warn(output)
        break
      case 'error':
        console.error(output)
        break
    }
  }
  
  debug(message: string, metadata?: any) {
    this.log('debug', message, metadata)
  }
  
  info(message: string, metadata?: any) {
    this.log('info', message, metadata)
  }
  
  warn(message: string, metadata?: any) {
    this.log('warn', message, metadata)
  }
  
  error(message: string, error?: Error | any, metadata?: any) {
    const entry: LogEntry = {
      level: 'error',
      message,
      timestamp: new Date().toISOString(),
      context: this.context,
      metadata,
    }
    
    if (error instanceof Error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      }
    } else if (error) {
      entry.error = error
    }
    
    console.error(JSON.stringify(entry))
  }
}

// Export logger factory
export function createLogger(context: string) {
  return new Logger(context)
}

// Export default logger
export const logger = new Logger()
