import axios, { AxiosResponse } from 'axios';
import { Response } from 'express';
import { Transform } from 'stream';
import { env } from '../config/env';
import { ProxyHeaders, ChatCompletionRequest, ResponsesRequest } from '../types';
import { injectCacheControl, injectCacheControlResponses } from './cache.service';
import { logger } from '../utils/logger';

const openRouterClient = axios.create({
  baseURL: env.openRouterBaseUrl,
  timeout: 120000,
});

/**
 * Forwards a GET request transparently to OpenRouter.
 */
export async function forwardGetRequest(
  path: string,
  headers: ProxyHeaders,
): Promise<AxiosResponse> {
  logger.debug(`Forwarding GET ${path}`);
  return openRouterClient.get(path, { headers });
}

/**
 * Forwards a POST chat/completions request with cache injection.
 * Supports both regular and streaming responses.
 */
export async function forwardChatCompletion(
  body: ChatCompletionRequest,
  headers: ProxyHeaders,
  res: Response,
): Promise<void> {
  logger.info('Chat Completions - Request from n8n', {
    model: body.model,
    messagesCount: body.messages.length,
  });

  const modifiedBody = injectCacheControl(body);
  const isStreaming = modifiedBody.stream === true;

  logger.info('Chat Completions - Request to OpenRouter', {
    model: modifiedBody.model,
    streaming: isStreaming,
  });

  if (isStreaming) {
    await handleStreamingResponse(modifiedBody, headers, res);
  } else {
    await handleRegularResponse(modifiedBody, headers, res);
  }
}

async function handleRegularResponse(
  body: ChatCompletionRequest,
  headers: ProxyHeaders,
  res: Response,
): Promise<void> {
  const response = await openRouterClient.post('/chat/completions', body, { headers });

  logUsage('Chat Completions', response.data?.usage);

  res.status(response.status).json(response.data);
}

async function handleStreamingResponse(
  body: ChatCompletionRequest,
  headers: ProxyHeaders,
  res: Response,
): Promise<void> {
  const response = await openRouterClient.post('/chat/completions', body, {
    headers,
    responseType: 'stream',
  });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const usageTransform = new Transform({
    transform(chunk, _encoding, callback) {
      const text = chunk.toString();
      const lines = text.split('\n').filter((l: string) => l.startsWith('data: '));

      for (const line of lines) {
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          if (parsed.usage) {
            logUsage('Chat Completions (stream)', parsed.usage);
          }
        } catch {
          // Not valid JSON, skip
        }
      }

      callback(null, chunk);
    },
  });

  response.data.pipe(usageTransform).pipe(res);
}

/**
 * Forwards a POST /v1/responses request with cache injection.
 */
export async function forwardResponsesRequest(
  body: ResponsesRequest,
  headers: ProxyHeaders,
  res: Response,
): Promise<void> {
  logger.info('Responses API - Request from n8n', {
    inputItems: Array.isArray(body.input) ? body.input.length : 'string',
  });

  const modifiedBody = injectCacheControlResponses(body);
  const isStreaming = modifiedBody.stream === true;

  if (Array.isArray(modifiedBody.input)) {
    const items = modifiedBody.input.map((item, i) => {
      const contentPreview = typeof item.content === 'string'
        ? `string(${item.content.length} chars)`
        : `array(${item.content.length} parts)`;
      const hasCache = !!item.cache_control;
      return `[${i}] ${item.role}: ${contentPreview}${hasCache ? ' CACHED' : ''}`;
    });
    logger.info('Responses API - Request to OpenRouter', {
      model: modifiedBody.model,
      streaming: isStreaming,
      items,
    });
  }

  if (isStreaming) {
    const response = await openRouterClient.post('/responses', modifiedBody, {
      headers,
      responseType: 'stream',
    });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const usageTransform = new Transform({
      transform(chunk, _encoding, callback) {
        const text = chunk.toString();
        const lines = text.split('\n').filter((l: string) => l.startsWith('data: '));

        for (const line of lines) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.usage) {
              logUsage('Responses API (stream)', parsed.usage);
            }
          } catch {
            // Not valid JSON, skip
          }
        }

        callback(null, chunk);
      },
    });

    response.data.pipe(usageTransform).pipe(res);
  } else {
    const response = await openRouterClient.post('/responses', modifiedBody, { headers });

    logUsage('Responses API', response.data?.usage);

    res.status(response.status).json(response.data);
  }
}

/**
 * Forwards any other POST/PUT/DELETE request transparently.
 */
export async function forwardGenericRequest(
  method: string,
  path: string,
  headers: ProxyHeaders,
  body?: unknown,
): Promise<AxiosResponse> {
  logger.debug(`Forwarding ${method} ${path}`);

  return openRouterClient.request({
    method,
    url: path,
    headers,
    data: body,
  });
}

function logUsage(api: string, usage: Record<string, unknown> | undefined): void {
  if (!usage) return;

  const prompt = (usage.prompt_tokens as number) || 0;
  const completion = (usage.completion_tokens as number) || 0;
  const details = usage.prompt_tokens_details as Record<string, number> | undefined;
  const cached = details?.cached_tokens || 0;
  const cacheWrite = details?.cache_write_tokens || 0;
  const cachePercent = prompt > 0 ? ((cached / prompt) * 100).toFixed(1) : '0';
  const cost = usage.cost as number | undefined;

  logger.info(`${api} - Usage`, {
    prompt_tokens: prompt,
    completion_tokens: completion,
    cached_tokens: cached,
    cache_write_tokens: cacheWrite,
    cache_hit: `${cachePercent}%`,
    cost: cost ? `$${cost.toFixed(6)}` : undefined,
  });

  // Log raw usage for debugging when tokens are 0
  if (prompt === 0) {
    logger.debug(`${api} - Raw usage`, usage);
  }
}
