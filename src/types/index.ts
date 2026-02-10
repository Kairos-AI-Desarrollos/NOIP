export interface CacheControl {
  type: 'ephemeral';
  ttl?: string;
}

export interface MessageContent {
  type: string;
  text?: string;
  cache_control?: CacheControl;
}

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | MessageContent[];
}

export interface ToolFunction {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

export interface Tool {
  type: 'function';
  function: ToolFunction;
  cache_control?: CacheControl;
}

export interface ChatCompletionRequest {
  model: string;
  messages: Message[];
  tools?: Tool[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  [key: string]: unknown;
}

// Responses API types (/v1/responses)
export interface ResponsesInputItem {
  type: 'message';
  role: 'system' | 'user' | 'assistant' | 'developer';
  content: string | MessageContent[];
  cache_control?: CacheControl;
}

export interface ResponsesRequest {
  model: string;
  input: string | ResponsesInputItem[];
  stream?: boolean;
  instructions?: string;
  [key: string]: unknown;
}

export interface OpenAIErrorResponse {
  error: {
    message: string;
    type: string;
    code: string | number;
  };
}

export interface ProxyHeaders {
  authorization?: string;
  'http-referer'?: string;
  'x-title'?: string;
  [key: string]: string | undefined;
}
