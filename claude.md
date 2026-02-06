# Project: N8N-OpenRouter Intelligence Proxy (NOIP)

## Context
You are an expert Backend Engineer. The goal is to build a "Transparent Proxy" between n8n and OpenRouter/LLM Providers. n8n (as of 2026) lacks native support for "Prompt Caching" parameters. This proxy will intercept outgoing calls from n8n's AI nodes, inject `cache_control` headers/body parameters, and return the response seamlessly.

## Tech Stack
- **Runtime:** Node.js with TypeScript.
- **Framework:** Express.js.
- **HTTP Client:** Axios (for robust request/response interception).
- **Containerization:** Docker & Docker Compose.
- **Quality:** ESLint, Prettier, and strictly typed interfaces.

## Core Functional Requirements
1. **Transparent Routing:** All GET requests (e.g., `/v1/models`) must be forwarded to OpenRouter to maintain the model selector functionality in n8n.
2. **Payload Interception:** Intercept POST `/v1/chat/completions`.
3. **Cache Injection Logic:** - Identify the `messages` array in the body.
    - If a `system` message or a specific large text block is present, inject `"cache_control": { "type": "ephemeral" }` based on configurable rules (by model or keyword).
4. **Header Management:** Forward `Authorization`, `HTTP-Referer`, and `X-Title` headers from n8n to OpenRouter.
5. **Observability:** Log which requests were modified and the size of the cached prompt.

## Architecture Guidelines
- Use a **Controller/Service/Middleware** pattern.
- Implement an **Error Handler** that returns standard OpenAI-compatible error codes so n8n doesn't crash.
- Configuration must be handled via Environment Variables (.env).

## Implementation Rules
- DO NOT modify the original prompt content, only add the caching metadata.
- Ensure the proxy is "Streaming-Ready" (Forward Server-Sent Events if n8n requests streaming).
- The Dockerfile must be multi-stage for production optimization.