import { Request, Response, NextFunction } from 'express';
import { AxiosError } from 'axios';
import { logger } from '../utils/logger';
import { OpenAIErrorResponse } from '../types';

export function errorMiddleware(
  err: Error & { statusCode?: number },
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Extract upstream error details from Axios errors
  const axiosErr = err as AxiosError;
  const upstreamData = axiosErr.response?.data as Record<string, unknown> | undefined;
  const upstreamStatus = axiosErr.response?.status;
  const statusCode = upstreamStatus || err.statusCode || 500;

  logger.error('Request error', {
    message: err.message,
    statusCode,
    upstream: upstreamData,
    stack: err.stack,
  });

  // Forward the upstream error response if available
  if (upstreamData) {
    res.status(statusCode).json(upstreamData);
    return;
  }

  const errorResponse: OpenAIErrorResponse = {
    error: {
      message: err.message || 'Internal server error',
      type: statusCode >= 500 ? 'server_error' : 'invalid_request_error',
      code: statusCode,
    },
  };

  res.status(statusCode).json(errorResponse);
}
