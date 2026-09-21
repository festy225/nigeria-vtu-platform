import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { ProvidersModule } from '../providers/providers.module';

@Module({ imports: [ProvidersModule], controllers: [PaymentController], providers: [PaymentService] })
export class PaymentModule {}