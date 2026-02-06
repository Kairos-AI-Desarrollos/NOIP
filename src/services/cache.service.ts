import {
  ChatCompletionRequest,
  Message,
  MessageContent,
  CacheControl,
  ResponsesRequest,
  ResponsesInputItem,
} from '../types';
import { env } from '../config/env';
import { logger } from '../utils/logger';

interface CacheCandidate {
  index: number;
  role: string;
  contentLength: number;
  priority: number;
}

/**
 * Injects cache_control into content parts of the messages array.
 * Follows OpenRouter spec: cache_control must be on content parts (inside arrays),
 * NOT at the message level. String content is converted to multipart format when needed.
 *
 * Uses a strategic breakpoint selection algorithm:
 * 1. System messages always get highest priority
 * 2. Large recent messages get next priority (most recent first)
 * 3. Limited to cacheMaxBreakpoints (default 4, Anthropic's limit)
 */
export function injectCacheControl(body: ChatCompletionRequest): ChatCompletionRequest {
  if (!env.cacheEnabled) {
    return body;
  }

  if (!body.messages || !Array.isArray(body.messages)) {
    return body;
  }

  const modified = { ...body, messages: [...body.messages] };

  // Pass 1: Identify candidates
  const candidates: CacheCandidate[] = [];

  modified.messages.forEach((message: Message, index: number) => {
    const contentLength = getContentLength(message);

    if (message.role === 'system') {
      candidates.push({ index, role: message.role, contentLength, priority: 0 });
    } else if (contentLength >= env.cacheMinChars) {
      candidates.push({ index, role: message.role, contentLength, priority: 1 });
    }
  });

  // Pass 2: Prioritize and select up to maxBreakpoints
  candidates.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return b.index - a.index; // prefer more recent messages
  });

  const selected = candidates.slice(0, env.cacheMaxBreakpoints);
  const selectedIndices = new Set(selected.map((c) => c.index));

  if (selected.length === 0) {
    return body;
  }

  // Pass 3: Apply injection
  const cacheControl: CacheControl = { type: 'ephemeral', ...(env.cacheTtl && { ttl: env.cacheTtl }) };

  modified.messages = modified.messages.map((message: Message, index: number) => {
    if (!selectedIndices.has(index)) return message;

    if (typeof message.content === 'string') {
      return {
        ...message,
        content: toMultipartContent(message.content, cacheControl),
      };
    }

    if (Array.isArray(message.content)) {
      const updatedContent = [...message.content];
      for (let i = updatedContent.length - 1; i >= 0; i--) {
        if (updatedContent[i].type === 'text') {
          updatedContent[i] = { ...updatedContent[i], cache_control: cacheControl };
          break;
        }
      }
      return { ...message, content: updatedContent };
    }

    return message;
  });

  logger.info(`Cache control injected into ${selected.length}/${env.cacheMaxBreakpoints} breakpoints`, {
    model: body.model,
    totalMessages: body.messages.length,
    breakpoints: selected.map((c) => ({
      messageIndex: c.index,
      role: c.role,
      contentChars: c.contentLength,
    })),
  });

  return modified;
}

/**
 * Injects cache_control into the Responses API format (/v1/responses).
 * Same logic as injectCacheControl but works with `input` array of items
 * instead of `messages`.
 */
export function injectCacheControlResponses(body: ResponsesRequest): ResponsesRequest {
  if (!env.cacheEnabled) {
    return body;
  }

  if (!Array.isArray(body.input)) {
    return body;
  }

  const modified = { ...body, input: [...body.input] };

  // Pass 1: Identify candidates
  const candidates: CacheCandidate[] = [];

  modified.input.forEach((item: ResponsesInputItem, index: number) => {
    const contentLength = getItemContentLength(item);

    if (item.role === 'system' || item.role === 'developer') {
      candidates.push({ index, role: item.role, contentLength, priority: 0 });
    } else if (contentLength >= env.cacheMinChars) {
      candidates.push({ index, role: item.role, contentLength, priority: 1 });
    }
  });

  // Pass 2: Prioritize and select
  candidates.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return b.index - a.index;
  });

  const selected = candidates.slice(0, env.cacheMaxBreakpoints);
  const selectedIndices = new Set(selected.map((c) => c.index));

  if (selected.length === 0) {
    return body;
  }

  // Pass 3: Apply injection at item level (Responses API doesn't support multipart content arrays)
  const cacheControl: CacheControl = { type: 'ephemeral', ...(env.cacheTtl && { ttl: env.cacheTtl }) };

  modified.input = modified.input.map((item: ResponsesInputItem, index: number) => {
    if (!selectedIndices.has(index)) return item;
    return { ...item, cache_control: cacheControl };
  });

  logger.info(`[Responses API] Cache control injected into ${selected.length}/${env.cacheMaxBreakpoints} breakpoints`, {
    model: body.model,
    totalItems: body.input.length,
    breakpoints: selected.map((c) => ({
      itemIndex: c.index,
      role: c.role,
      contentChars: c.contentLength,
    })),
  });

  return modified;
}

function toMultipartContent(content: string, cacheControl: CacheControl): MessageContent[] {
  return [{ type: 'text', text: content, cache_control: cacheControl }];
}

function getContentLength(message: Message): number {
  if (typeof message.content === 'string') {
    return message.content.length;
  }
  if (Array.isArray(message.content)) {
    return message.content.reduce((sum, part) => sum + (part.text?.length || 0), 0);
  }
  return 0;
}

function getItemContentLength(item: ResponsesInputItem): number {
  if (typeof item.content === 'string') {
    return item.content.length;
  }
  if (Array.isArray(item.content)) {
    return item.content.reduce((sum, part) => sum + (part.text?.length || 0), 0);
  }
  return 0;
}
