import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT는 1~65535 사이 정수여야 합니다.');
  }

  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  await app.listen(port, process.env.HOST ?? '127.0.0.1');
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
