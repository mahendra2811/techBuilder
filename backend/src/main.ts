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
  app.enableCors({ origin: true, credentials: true });
  await app.listen(env.PORT);
  new Logger('Bootstrap').log(`techBuilder API on :${env.PORT}${API_BASE}`);
}

void bootstrap();
