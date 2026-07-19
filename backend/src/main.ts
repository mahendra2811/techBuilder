import 'reflect-metadata';
import helmet from 'helmet';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { API_BASE } from '@techbuilder/contracts';
import { loadEnv } from './config/env';
import { DbService } from './db/db.service';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: false });
  // This API is JSON-only and served behind the Next.js proxy / Caddy; helmet sets the standard
  // hardening headers (nosniff, frameguard, HSTS in prod, etc.). No CSP here — there is no HTML
  // surface (Swagger, when enabled, ships its own).
  app.use(helmet({ contentSecurityPolicy: false }));
  // Trust the first proxy hop so the rate limiter keys on X-Forwarded-For when present. (The
  // current web proxy does not forward the client IP — see auth.controller.ts throttle note — so
  // this is future-proofing for when it does / when a real LB fronts the origin.)
  app.set('trust proxy', 1);
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

  // Swagger UI — dev tool, off in production unless SWAGGER_ENABLED=1. Bodies are validated
  // by ZodBody pipes (not class DTOs), so the doc lists routes/params but not body schemas —
  // request shapes live in @techbuilder/contracts (shared/src/dto.ts).
  if (env.NODE_ENV !== 'production' || env.SWAGGER_ENABLED === '1') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('techBuilder API')
      .setDescription('Construction field-operations API. All routes under /api/v1; authenticate via POST /api/v1/auth/login, then Authorize with the accessToken.')
      .setVersion('1.0')
      .addBearerAuth()
      .addSecurityRequirements('bearer')
      .build();
    const documentFactory = (): ReturnType<typeof SwaggerModule.createDocument> =>
      SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, documentFactory);
  }

  // Fail closed if any tenant table is missing RLS (see DbService.assertRlsEnforced) — throws in
  // production, warns in dev. Runs before we accept a single request.
  await app.get(DbService).assertRlsEnforced();

  await app.listen(env.PORT);
  new Logger('Bootstrap').log(`techBuilder API on :${env.PORT}${API_BASE}`);
}

void bootstrap();
