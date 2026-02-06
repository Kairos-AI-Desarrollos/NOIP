import { Router } from 'express';
import {
  handleChatCompletion,
  handleResponses,
  handleGetProxy,
  handleGenericProxy,
  healthCheck,
} from '../controllers/proxy.controller';

const router = Router();

// Health check
router.get('/health', healthCheck);

// Intercept chat completions for cache injection
router.post('/v1/chat/completions', handleChatCompletion);

// Intercept responses API for cache injection
router.post('/v1/responses', handleResponses);

// Transparent proxy for all other GET /v1/* routes (e.g., /v1/models)
router.get('/v1/*', handleGetProxy);

// Transparent proxy for any other /v1/* routes
router.all('/v1/*', handleGenericProxy);

export default router;
