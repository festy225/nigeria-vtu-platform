import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuthorizationExampleModule } from './modules/auth/authorization-example.module';
import { DatabaseModule } from './infrastructure/database/database.module';
import { HealthModule } from './modules/health/health.module';
import { UsersModule } from './modules/users/users.module';
import { WalletModule } from './modules/wallets/wallet.module';
import { FeatureModule } from './modules/features/feature.module';
import { FeatureCheckModule } from './modules/features/feature-check.module';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, expandVariables: true }),
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 100 }] }),
    DatabaseModule,
    AuditModule,
    HealthModule,
    UsersModule,
    AuthModule,
    AuthorizationExampleModule,
    WalletModule,
    FeatureModule,
    FeatureCheckModule
  ],
  providers: []
})
export class AppModule {}
