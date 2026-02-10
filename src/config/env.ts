import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export interface EnvConfig {
  port: number;
  nodeEnv: string;
  openRouterBaseUrl: string;
  openRouterApiKey: string;
  cacheEnabled: boolean;
  cacheMinChars: number;
  cacheMaxBreakpoints: number;
  cacheTtl: string | undefined;
  cacheModelPrefixes: string[];
  logLevel: string;
}

export const env: EnvConfig = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  openRouterBaseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
  openRouterApiKey: process.env.OPENROUTER_API_KEY || '',
  cacheEnabled: process.env.CACHE_ENABLED !== 'false',
  cacheMinChars: parseInt(process.env.CACHE_MIN_CHARS || '1000', 10),
  cacheMaxBreakpoints: parseInt(process.env.CACHE_MAX_BREAKPOINTS || '4', 10),
  cacheTtl: process.env.CACHE_TTL || undefined,
  cacheModelPrefixes: process.env.CACHE_MODEL_PREFIXES === '*'
    ? ['*']
    : (process.env.CACHE_MODEL_PREFIXES || 'anthropic/,deepseek/,google/,openai/,x-ai/')
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p.length > 0),
  logLevel: process.env.LOG_LEVEL || 'info',
};

