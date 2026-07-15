import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  // Brief §4: all endpoints under /api/v1.
  app.setGlobalPrefix('api/v1', {
    exclude: ['health'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // CORS — read allowlist from CORS_ORIGIN env var.
  const config = app.get(ConfigService);
  const origins = (config.get<string>('CORS_ORIGIN') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors({
    origin: origins.length > 0 ? origins : true,
    credentials: true,
  });

  const port = Number(config.get<string>('API_PORT') ?? 4000);
  const host = '0.0.0.0';
  await app.listen(port, host);

  const logger = new Logger('Bootstrap');
  logger.log(`API listening on http://${host}:${port}`);
  logger.log(`CORS allowlist: ${origins.join(', ') || '(all — dev mode)'}`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[api] fatal during bootstrap', err);
  process.exit(1);
});
