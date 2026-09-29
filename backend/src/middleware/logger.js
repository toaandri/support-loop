// Structured logger — emits JSON lines to stdout/stderr.
// Fields: timestamp, level, service, message, and any extra context.
//
// Usage:
//   import { logger } from './logger.js';
//   logger.info('Server started', { port: 3000 });
//   logger.warn('Low confidence escalation', { conversationId, reason });
//   logger.error('Tool execution failed', { name, error: err.message });

const SERVICE = 'support-loop-backend';

function log(level, message, context = {}) {
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    service: SERVICE,
    message,
    ...context
  });
  if (level === 'error' || level === 'warn') {
    process.stderr.write(entry + '\n');
  } else {
    process.stdout.write(entry + '\n');
  }
}

export const logger = {
  info: (message, context) => log('info', message, context),
  warn: (message, context) => log('warn', message, context),
  error: (message, context) => log('error', message, context),
  debug: (message, context) => {
    if (process.env.LOG_LEVEL === 'debug') log('debug', message, context);
  }
};

// Express request logger middleware
export function requestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    logger.info('http', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - start,
      ip: req.ip
    });
  });
  next();
}
