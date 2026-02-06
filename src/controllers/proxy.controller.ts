import { Request, Response, NextFunction } from 'express';
import { extractProxyHeaders } from '../middlewares/headers.middleware';
import { forwardGetRequest, forwardChatCompletion, forwardResponsesRequest, forwardGenericRequest } from '../services/proxy.service';
import { ChatCompletionRequest, ResponsesRequest } from '../types';
import { logger } from '../utils/logger';

/**
 * Handles POST /v1/chat/completions — intercepts and injects cache_control.
 */
export async function handleChatCompletion(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    logger.info(`HANDLER: handleChatCompletion | ${req.method} ${req.path}`);
    const headers = extractProxyHeaders(req);
    const body = req.body as ChatCompletionRequest;
    await forwardChatCompletion(body, headers, res);
  } catch (error) {
    next(error);
  }
}

/**
 * Handles POST /v1/responses — intercepts and injects cache_control.
 */
export async function handleResponses(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    logger.info(`HANDLER: handleResponses | ${req.method} ${req.path}`);
    const headers = extractProxyHeaders(req);
    const body = req.body as ResponsesRequest;
    await forwardResponsesRequest(body, headers, res);
  } catch (error) {
    next(error);
  }
}

/**
 * Handles all GET /v1/* requests — transparent proxy to OpenRouter.
 */
export async function handleGetProxy(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    logger.info(`HANDLER: handleGetProxy | ${req.method} ${req.path}`);
    const headers = extractProxyHeaders(req);
    const forwardPath = req.path.replace(/^\/v1/, '');
    const response = await forwardGetRequest(forwardPath, headers);
    res.status(response.status).json(response.data);
  } catch (error) {
    next(error);
  }
}

/**
 * Handles all other requests — generic transparent proxy.
 */
export async function handleGenericProxy(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    logger.info(`HANDLER: handleGenericProxy | ${req.method} ${req.path}`);
    logger.debug('Generic proxy body', { body: req.body });
    const headers = extractProxyHeaders(req);
    const forwardPath = req.path.replace(/^\/v1/, '');
    const response = await forwardGenericRequest(req.method, forwardPath, headers, req.body);
    res.status(response.status).json(response.data);
  } catch (error) {
    next(error);
  }
}

/**
 * Health check endpoint.
 */
export function healthCheck(_req: Request, res: Response): void {
  res.json({ status: 'ok', service: 'open-router-proxy' });
}
