import express from 'express';
import cors from 'cors';
import proxyRoutes from './routes/proxy.routes';
import { loggerMiddleware } from './middlewares/logger.middleware';
import { errorMiddleware } from './middlewares/error.middleware';

const app = express();

// Global middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(loggerMiddleware);

// Routes
app.use(proxyRoutes);

// Error handling (must be last)
app.use(errorMiddleware);

export default app;
