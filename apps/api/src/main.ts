import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  const port = Number(process.env.PORT ?? 3001);

  await app.listen(port);
  console.log(`API is running on http://localhost:${port}`);
}

bootstrap();
