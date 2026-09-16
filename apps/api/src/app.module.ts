import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard';
import { RolesGuard } from './common/auth/roles.guard';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuthorizationExampleModule } from './modules/auth/authorization-example.module';
import { DatabaseModule } from './infrastructure/database/database.module';
import { HealthModule } from './modules/health/health.module';
import { UsersModule } from './modules/users/users.module';
import { WalletModule } from './modules/wallets/wallet.module';

@Global()
@Module({ imports: [ConfigModule.forRoot({ isGlobal: true, cache: true, expandVariables: true }), ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 100 }] }), DatabaseModule, AuditModule, HealthModule, UsersModule, AuthModule, AuthorizationExampleModule, WalletModule], providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }, { provide: APP_GUARD, useClass: JwtAuthGuard }, { provide: APP_GUARD, useClass: RolesGuard }] })
export class AppModule {}
