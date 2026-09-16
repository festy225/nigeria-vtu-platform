import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppModule } from './app.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigModule],
      useFactory: (config: ConfigModule) => ({
        throttlers: [{ ttl: Number(process.env.THROTTLE_TTL ?? 60_000), limit: Number(process.env.THROTTLE_LIMIT ?? 100) }]
      })
    }),
    AppModule
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }]
})
export class RootModule {}
