import { Request } from 'express';
import { ProxyHeaders } from '../types';
import { env } from '../config/env';

const FORWARDED_HEADERS = ['authorization', 'http-referer', 'x-title'] as const;

export function extractProxyHeaders(req: Request): ProxyHeaders {
  const headers: ProxyHeaders = {};

  for (const header of FORWARDED_HEADERS) {
    const value = req.headers[header];
    if (typeof value === 'string') {
      headers[header] = value;
    }
  }

  // If no authorization header from n8n, use the configured API key
  if (!headers.authorization && env.openRouterApiKey) {
    headers.authorization = `Bearer ${env.openRouterApiKey}`;
  }

  return headers;
}
