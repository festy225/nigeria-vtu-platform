import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RequestLoggingMiddleware.name);

  use(request: Request, response: Response, next: NextFunction) {
    const correlationId = request.header('x-correlation-id') ?? randomUUID();
    response.setHeader('x-correlation-id', correlationId);
    const startedAt = Date.now();
    response.on('finish', () => this.logger.log(`${request.method} ${request.originalUrl} ${response.statusCode} ${Date.now() - startedAt}ms correlationId=${correlationId}`));
    next();
  }
}
