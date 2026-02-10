import {
  ChatCompletionRequest,
  Message,
  MessageContent,
  CacheControl,
  Tool,
  ResponsesRequest,
  ResponsesInputItem,
} from '../types';
import { env } from '../config/env';
import { logger } from '../utils/logger';

/**
 * Represents a cache breakpoint candidate.
 * Follows Anthropic's cache prefix order: tools → system → messages.
 * See: https://platform.claude.com/docs/en/docs/build-with-claude/prompt-caching
 */
interface CacheBreakpoint {
  type: 'system_message' | 'tools' | 'user_message';
  messageIndex?: number;
  contentLength: number;
  priority: number; // 0 = system, 1 = tools, 2 = user/assistant messages
}

/**
 * Checks if a model supports explicit cache_control injection.
 * Models not in this list will pass through without cache_control
 * to avoid 404 errors from OpenRouter.
 */
function isModelCacheCompatible(model: string): boolean {
  const prefixes = env.cacheModelPrefixes;
  if (prefixes.length === 0) return false;
  if (prefixes.includes('*')) return true;
  return prefixes.some((prefix) => model.startsWith(prefix));
}

/**
 * Injects cache_control breakpoints into a chat completions request.
 *
 * Follows the official Anthropic prompt caching spec:
 * - Cache prefix order: tools → system → messages
 * - cache_control on tools: placed on the LAST element of the tools array
 * - cache_control on messages: placed on the last text content part (multipart format)
 * - Max 4 breakpoints per request
 *
 * Priority allocation:
 *   0 = system messages (always cached, no min chars)
 *   1 = tools array (one breakpoint for the entire array, on last tool)
 *   2 = non-system messages (must meet cacheMinChars threshold, most recent first)
 *
 * Only applied to models in CACHE_MODEL_PREFIXES to avoid errors on unsupported models.
 */
export function injectCacheControl(body: ChatCompletionRequest): ChatCompletionRequest {
  if (!env.cacheEnabled) {
    return body;
  }

  if (!isModelCacheCompatible(body.model)) {
    logger.debug(`Cache skip: model "${body.model}" not in compatible prefixes`);
    return body;
  }

  if (!body.messages || !Array.isArray(body.messages)) {
    return body;
  }

  const breakpoints: CacheBreakpoint[] = [];

  // Collect system message candidates (priority 0 - always cached)
  body.messages.forEach((message: Message, index: number) => {
    if (message.role === 'system') {
      breakpoints.push({
        type: 'system_message',
        messageIndex: index,
        contentLength: getContentLength(message),
        priority: 0,
      });
    }
  });

  // Collect tools candidate (priority 1 - one breakpoint for entire array)
  if (body.tools && Array.isArray(body.tools) && body.tools.length > 0) {
    breakpoints.push({
      type: 'tools',
      contentLength: JSON.stringify(body.tools).length,
      priority: 1,
    });
  }

  // Collect non-system message candidates (priority 2 - must meet min chars)
  body.messages.forEach((message: Message, index: number) => {
    if (message.role !== 'system') {
      const contentLength = getContentLength(message);
      if (contentLength >= env.cacheMinChars) {
        breakpoints.push({
          type: 'user_message',
          messageIndex: index,
          contentLength,
          priority: 2,
        });
      }
    }
  });

  // Sort: priority ASC, then message index DESC (most recent first)
  breakpoints.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    const aIdx = a.messageIndex ?? -1;
    const bIdx = b.messageIndex ?? -1;
    return bIdx - aIdx;
  });

  // Select top N breakpoints
  const selected = breakpoints.slice(0, env.cacheMaxBreakpoints);

  if (selected.length === 0) {
    return body;
  }

  const cacheControl: CacheControl = { type: 'ephemeral', ...(env.cacheTtl && { ttl: env.cacheTtl }) };
  const modified = { ...body, messages: [...body.messages] };

  // Determine what to cache
  const messageIndicesToCache = new Set(
    selected
      .filter((bp) => bp.type === 'system_message' || bp.type === 'user_message')
      .map((bp) => bp.messageIndex!),
  );
  const shouldCacheTools = selected.some((bp) => bp.type === 'tools');

  // Inject into messages (system + user/assistant)
  if (messageIndicesToCache.size > 0) {
    modified.messages = modified.messages.map((message: Message, index: number) => {
      if (!messageIndicesToCache.has(index)) return message;

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
  }

  // Inject into tools (cache_control on the LAST tool per Anthropic spec)
  if (shouldCacheTools && body.tools && body.tools.length > 0) {
    const modifiedTools: Tool[] = [...body.tools];
    const lastIdx = modifiedTools.length - 1;
    modifiedTools[lastIdx] = { ...modifiedTools[lastIdx], cache_control: cacheControl };
    modified.tools = modifiedTools;
  }

  logger.info(`Cache control injected into ${selected.length}/${env.cacheMaxBreakpoints} breakpoints`, {
    model: body.model,
    totalMessages: body.messages.length,
    totalTools: body.tools?.length ?? 0,
    breakpoints: selected.map((bp) => ({
      type: bp.type,
      messageIndex: bp.messageIndex,
      contentChars: bp.contentLength,
    })),
  });

  return modified;
}

/**
 * Injects cache_control into the Responses API format (/v1/responses).
 * Same priority logic but works with `input` array of items instead of `messages`.
 */
export function injectCacheControlResponses(body: ResponsesRequest): ResponsesRequest {
  if (!env.cacheEnabled) {
    return body;
  }

  if (!isModelCacheCompatible(body.model)) {
    logger.debug(`[Responses API] Cache skip: model "${body.model}" not in compatible prefixes`);
    return body;
  }

  if (!Array.isArray(body.input)) {
    return body;
  }

  const modified = { ...body, input: [...body.input] };

  // Pass 1: Identify candidates
  const candidates: CacheBreakpoint[] = [];

  modified.input.forEach((item: ResponsesInputItem, index: number) => {
    const contentLength = getItemContentLength(item);

    if (item.role === 'system' || item.role === 'developer') {
      candidates.push({ type: 'system_message', messageIndex: index, contentLength, priority: 0 });
    } else if (contentLength >= env.cacheMinChars) {
      candidates.push({ type: 'user_message', messageIndex: index, contentLength, priority: 2 });
    }
  });

  // Pass 2: Prioritize and select
  candidates.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    const aIdx = a.messageIndex ?? -1;
    const bIdx = b.messageIndex ?? -1;
    return bIdx - aIdx;
  });

  const selected = candidates.slice(0, env.cacheMaxBreakpoints);
  const selectedIndices = new Set(selected.map((c) => c.messageIndex!));

  if (selected.length === 0) {
    return body;
  }

  // Pass 3: Apply injection at item level
  const cacheControl: CacheControl = { type: 'ephemeral', ...(env.cacheTtl && { ttl: env.cacheTtl }) };

  modified.input = modified.input.map((item: ResponsesInputItem, index: number) => {
    if (!selectedIndices.has(index)) return item;
    return { ...item, cache_control: cacheControl };
  });

  logger.info(`[Responses API] Cache control injected into ${selected.length}/${env.cacheMaxBreakpoints} breakpoints`, {
    model: body.model,
    totalItems: body.input.length,
    breakpoints: selected.map((c) => ({
      type: c.type,
      itemIndex: c.messageIndex,
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
