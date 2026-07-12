import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { API_BASE } from '@techbuilder/contracts';
import { loadEnv } from './config/env';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  app.setGlobalPrefix(API_BASE.replace(/^\//, '')); // 'api/v1'

  // Nothing calls this API from a browser today — the Next.js server is the only caller
  // (Bearer token, server-to-server; see web/src/lib/server/backend.ts) — but CORS is still
  // an explicit allowlist rather than reflecting every Origin, in case that ever changes.
  const configuredOrigins = (env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const allowedOrigins =
    configuredOrigins.length > 0 ? configuredOrigins : env.NODE_ENV === 'production' ? [] : ['http://localhost:3000'];
  app.enableCors({ origin: allowedOrigins, credentials: true });

  await app.listen(env.PORT);
  new Logger('Bootstrap').log(`techBuilder API on :${env.PORT}${API_BASE}`);
}

void bootstrap();
