import 'reflect-metadata';
import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { APP_NAME, type Health } from '@dalumaga/shared';

@Controller('health')
class HealthController {
  @Get()
  health(): Health {
    return { service: APP_NAME, status: 'ok' };
  }
}
@Module({ controllers: [HealthController] })
class AppModule {}
export async function createApp() {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('v1');
  app.enableCors({ origin: process.env.WEB_ORIGIN || 'http://localhost:5174' });
  return app;
}
