import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './infrastructure/database/database.module';
import { HealthModule } from './modules/health/health.module';
import { AuditModule } from './modules/audit/audit.module';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuthorizationExampleModule } from './modules/auth/authorization-example.module';

@Module({ imports: [ConfigModule, DatabaseModule, AuditModule, HealthModule, UsersModule, AuthModule, AuthorizationExampleModule] })
export class AppModule {}
