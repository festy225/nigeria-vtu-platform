import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../../common/auth/roles.guard';

@Module({ imports: [AuthModule], providers: [RolesGuard], exports: [RolesGuard] })
export class AuthorizationModule {}
