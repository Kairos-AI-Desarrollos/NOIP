import { Request } from 'express';
import { ProxyHeaders } from '../types';

const FORWARDED_HEADERS = ['authorization', 'http-referer', 'x-title'] as const;

export function extractProxyHeaders(req: Request): ProxyHeaders {
  const headers: ProxyHeaders = {};

  for (const header of FORWARDED_HEADERS) {
    const value = req.headers[header];
    if (typeof value === 'string') {
      headers[header] = value;
    }
  }

  return headers;
}
