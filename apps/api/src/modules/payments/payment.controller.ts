import { Body, Controller, Headers, Post } from '@nestjs/common';
import { Public } from '../../common/auth/auth.decorators';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { FundWalletDto } from './dto/fund-wallet.dto';
import { PaymentService } from './payment.service';

@Controller('payments')
export class PaymentController {
  constructor(private readonly payments: PaymentService) {}

  @Post('fund')
  fund(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: FundWalletDto,
  ) {
    return this.payments.createFundingIntent(user.id, user.email, dto);
  }

  @Public()
  @Post('callback')
  callback(
    @Body() payload: unknown,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    return this.payments.completeFromWebhook(payload, headers);
  }
}
