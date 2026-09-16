import { Module } from '@nestjs/common';
import { AuthModule } from './auth.module';
import { AuthorizationExampleController } from './authorization-example.controller';

@Module({ imports: [AuthModule], controllers: [AuthorizationExampleController] })
export class AuthorizationExampleModule {}
