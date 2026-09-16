import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ApiResponseInterceptor } from './common/interceptors/api-response.interceptor';
import { RequestLoggingMiddleware } from './common/middleware/request-logging.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.use(helmet());
  app.enableCors({ origin: process.env.CORS_ORIGIN?.split(',') ?? true, credentials: true });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ApiResponseInterceptor());
  const requestLogging = new RequestLoggingMiddleware();
  app.use(requestLogging.use.bind(requestLogging));
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  console.log(`API is running on http://localhost:${port}/api/v1`);
}
bootstrap().catch((error: unknown) => { console.error('Unable to start API', error); process.exit(1); });
