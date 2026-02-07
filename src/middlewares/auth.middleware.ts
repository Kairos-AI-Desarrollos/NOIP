import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { OpenAIErrorResponse } from '../types';

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers['x-proxy-token'];

  if (!header || typeof header !== 'string') {
    logger.warn('Auth: missing X-Proxy-Token header', { ip: req.ip });
    const error: OpenAIErrorResponse = {
      error: {
        message: 'Missing authentication token. Provide X-Proxy-Token header.',
        type: 'authentication_error',
        code: 401,
      },
    };
    res.status(401).json(error);
    return;
  }

  const token = header.startsWith('Bearer ') ? header.slice(7) : header;

  try {
    jwt.verify(token, env.jwtSecret);
    next();
  } catch (err) {
    logger.warn('Auth: invalid JWT', { ip: req.ip, error: (err as Error).message });
    const error: OpenAIErrorResponse = {
      error: {
        message: 'Invalid or expired authentication token.',
        type: 'authentication_error',
        code: 401,
      },
    };
    res.status(401).json(error);
  }
}
