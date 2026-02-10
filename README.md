<div align="center">

![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Express](https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)
![Claude](https://img.shields.io/badge/Built%20with-Claude%20Code-D97706?logo=anthropic&logoColor=white)
![Status](https://img.shields.io/badge/Estado-En%20uso%20activo-brightgreen)

<strong><h1>NOIP — N8N-OpenRouter Intelligence Proxy</h1></strong>

Proxy transparente entre **n8n** y **OpenRouter** que inyecta parámetros de `cache_control` automáticamente para habilitar **Prompt Caching** y reducir costos de API hasta ~90%.

<img src="./noip-logo.svg" alt="Logo" width="300" />

</div>

## ¿Por qué?

N8N no soporta nativamente los parámetros de Prompt Caching de Anthropic. Este proxy intercepta las llamadas de n8n a OpenRouter, inyecta `cache_control` en los mensajes estratégicos (system prompts, mensajes largos) y reenvía la respuesta sin modificarla.

```
n8n  →  NOIP Proxy (localhost:3000)  →  OpenRouter  →  Claude / GPT / Gemini
         ↑ Inyecta cache_control
```

## Compatibilidad por modelo

| Modelo                 | Tipo de caching               | Descuento en tokens cacheados | Mín. tokens                                       | TTL                     | Notas                                               |
| ---------------------- | ----------------------------- | ----------------------------- | ------------------------------------------------- | ----------------------- | --------------------------------------------------- |
| **Claude (Anthropic)** | Explícito via `cache_control` | 90% (reads a 0.1x)            | 1024 (Sonnet/Opus 4+), 4096 (Opus 4.5, Haiku 4.5) | 5 min (se renueva) o 1h | Máximo beneficio. Sistema + tools + mensajes cacheados. Hasta 4 breakpoints |
| **DeepSeek**           | Explícito via `cache_control` | 90% (reads a 0.1x)            | 1024                                              | 5 min                   | Soportado por el proxy con `CACHE_MODEL_PREFIXES`   |
| **Gemini 2.5 Pro**     | Implícito (automático)        | 75% (reads a 0.25x)           | 2048                                              | ~5 min (no se renueva)  | Caching automático, no requiere `cache_control`    |
| **GPT-4.1 (OpenAI)**   | Implícito (automático)        | 50% (reads a 0.5x)            | 1024                                              | 5-10 min                | Caching automático, no requiere `cache_control`    |

## Requisitos

- Node.js 20+
- Cuenta de [OpenRouter](https://openrouter.ai/) con API key

## Instalación

```bash
git clone <repo-url>
cd proxy-open-router-node
npm install
cp .example.env .env
```

Edita `.env` con tu API key de OpenRouter:

```env
OPENROUTER_API_KEY=sk-or-tu-key-aqui
CACHE_MODEL_PREFIXES=anthropic/,deepseek/,google/,openai/,x-ai/
```

El proxy solo inyectará `cache_control` en los modelos que tengan un prefijo compatible. Para aplicar cache en **todos** los modelos (por tu cuenta y riesgo), usa:

```env
CACHE_MODEL_PREFIXES=*
```

## Configuración

| Variable                | Default                     | Descripción                                                      |
| ----------------------- | --------------------------- | ---------------------------------------------------------------- |
| `PORT`                  | `3000`                      | Puerto del servidor                                              |
| `NODE_ENV`              | `development`               | Entorno (development/production)                                 |
| `OPENROUTER_BASE_URL`   | `https://openrouter.ai/api/v1` | URL base de OpenRouter                                        |
| `OPENROUTER_API_KEY`    | —                           | Tu API key de OpenRouter                                         |
| `CACHE_ENABLED`         | `true`                      | Activar/desactivar inyección de cache                            |
| `CACHE_MIN_CHARS`       | `1000`                      | Caracteres mínimos para cachear un mensaje                       |
| `CACHE_MAX_BREAKPOINTS` | `4`                         | Máximo de breakpoints de cache por request (límite de Anthropic) |
| `CACHE_TTL`             | `5m`                        | TTL del cache (`5m` para 5 minutos, `1h` para 1 hora)            |
| `CACHE_MODEL_PREFIXES`  | `anthropic/,deepseek/,google/,openai/,x-ai/` | Prefijos de modelos que soportan `cache_control`. Use `*` para todos |
| `LOG_LEVEL`             | `info`                      | Nivel de logs (error, info, debug)                               |

## Uso

### Desarrollo

```bash
npm run dev
```

### Producción

```bash
npm run build
npm start
```

### Docker

```bash
docker compose up -d
```

## Configurar n8n

En el nodo de **OpenAI** o **AI Agent** de n8n:

1. Ve a las credenciales de OpenAI/OpenRouter
2. Cambia la **Base URL** a:
   ```
   http://localhost:3000/v1
   ```
3. Coloca tu API key de OpenRouter como API key
4. Listo — n8n enviará las llamadas al proxy, que inyecta cache y las reenvía a OpenRouter

## Despliegue en producción

Si n8n no corre en la misma máquina que el proxy, tienes varias opciones:

### Opción 1: Red Docker compartida (recomendado)

Si n8n y el proxy corren en Docker, conéctalos a la misma red:

```yaml
# docker-compose.yml del proxy
services:
  proxy:
    build: .
    container_name: noip-proxy
    env_file: .env
    restart: unless-stopped
    networks:
      - n8n-network

networks:
  n8n-network:
    external: true
```

Luego en n8n, usa como Base URL:

```
http://noip-proxy:3000/v1
```

> Para crear la red: `docker network create n8n-network` y asegúrate de que el contenedor de n8n también esté conectado a `n8n-network`.

### Opción 2: VPS / Servidor dedicado

Corre el proxy en el mismo servidor que n8n (con Docker o directo con Node.js). n8n accede via:

```
http://localhost:3000/v1        # misma máquina
http://<ip-interna>:3000/v1    # misma red privada
```

### Opción 3: ngrok (túnel para pruebas)

Si n8n está en la nube y el proxy corre en tu máquina local:

```bash
ngrok http 3000
```

Usa la URL pública que genera ngrok como Base URL en n8n:

```
https://abc123.ngrok-free.app/v1
```

> ngrok es ideal para pruebas rápidas, no para producción permanente.

## Endpoints

| Método | Ruta                   | Descripción                             |
| ------ | ---------------------- | --------------------------------------- |
| `GET`  | `/health`              | Health check                            |
| `POST` | `/v1/chat/completions` | Chat Completions con inyección de cache |
| `POST` | `/v1/responses`        | Responses API con inyección de cache    |
| `GET`  | `/v1/*`                | Proxy transparente (ej: `/v1/models`)   |
| `ALL`  | `/v1/*`                | Proxy genérico para otras rutas         |

## ¿Cómo funciona el cache?

El proxy implementa la estrategia oficial de Anthropic con 3 pasos:

1. **Identificar candidatos** — Recopila:
   - System messages (siempre, sin mínimo de caracteres)
   - Tools/funciones array (si existe, 1 breakpoint para todo el array)
   - Mensajes no-system (solo si tienen >= `CACHE_MIN_CHARS`)

2. **Priorizar** — Distribuye los 4 breakpoints disponibles por orden de importancia:
   - **Prioridad 0**: System prompt (caching estable)
   - **Prioridad 1**: Tools/funciones (reutilizables en cada iteración del agent)
   - **Prioridad 2**: Mensajes recientes (más cambian, menos beneficio)

3. **Inyectar** — Agrega `cache_control: { type: "ephemeral" }` respetando la especificación oficial:
   - En tools: coloca en el **último elemento** del array
   - En mensajes: coloca en el **último text part** del content (convierte a multipart si es string)


## Scripts

| Comando          | Descripción                   |
| ---------------- | ----------------------------- |
| `npm run dev`    | Desarrollo con hot-reload     |
| `npm run build`  | Compilar TypeScript           |
| `npm start`      | Ejecutar build de producción  |
| `npm run lint`   | Verificar código con ESLint   |
| `npm run format` | Formatear código con Prettier |

## Verificación del funcionamiento

Para confirmar que el cache está activo, revisa los logs en busca de líneas como:

```json
{
  "breakpoints": [
    { "type": "system_message", "contentChars": 7432, "messageIndex": 0 },
    { "type": "tools", "contentChars": 9893 },
    { "type": "user_message", "contentChars": 2370, "messageIndex": 6 }
  ],
  "message": "Cache control injected into 3/4 breakpoints",
  "totalTools": 14
}
```

Y en la respuesta de OpenRouter verifica los campos de uso:

```json
{
  "cache_hit": "89.9%",
  "cached_tokens": 8982,
  "cache_write_tokens": 0,
  "prompt_tokens": 9993
}
```

Esto indica que el cache está siendo reutilizado correctamente.

---

> Este proyecto fue desarrollado con la asistencia de [Claude Code](https://claude.ai/claude-code) para agilizar el desarrollo y las pruebas. Todo el código ha sido revisado, probado y validado manualmente. Actualmente es una solución en uso activo por su creador.
