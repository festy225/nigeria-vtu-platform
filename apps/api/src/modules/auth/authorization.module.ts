import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../../common/auth/roles.guard';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';

@Module({ imports: [AuthModule], providers: [JwtAuthGuard, RolesGuard], exports: [JwtAuthGuard, RolesGuard] })
export class AuthorizationModule {}
