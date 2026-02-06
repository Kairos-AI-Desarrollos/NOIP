import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export function loggerMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(`${req.method} ${req.path} ${res.statusCode} - ${duration}ms`, {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      contentLength: req.headers['content-length'] || 0,
    });
  });

  next();
}
