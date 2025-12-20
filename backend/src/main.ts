import { NestFactory } from '@nestjs/core';
import * as bodyParser from 'body-parser';
import { AppModule } from './app.module';

function parseCorsOrigins(): { origins: string[] | true; allowCredentials: boolean } {
  const raw = process.env.CORS_ORIGINS;
  if (!raw) {
    return { origins: true, allowCredentials: false };
  }
  const entries = raw
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
  if (!entries.length || entries.includes('*')) {
    return { origins: true, allowCredentials: false };
  }
  return { origins: entries, allowCredentials: true };
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use('/billing/webhook', bodyParser.raw({ type: 'application/json' }));

  const { origins, allowCredentials } = parseCorsOrigins();
  app.enableCors({
    origin: origins,
    credentials: allowCredentials,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
  });

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`HTTP server listening on port ${port}`);
}

bootstrap();
