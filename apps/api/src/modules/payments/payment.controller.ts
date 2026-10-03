import {
  Body,
  Controller,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Public } from '../../common/auth/auth.decorators';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { FeatureGuard } from '../../common/features/feature.guard';
import { RequiresFeature } from '../../common/features/feature.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CreateMembershipPaymentDto } from './dto/create-membership-payment.dto';
import { CreateMarketplacePaymentDto } from './dto/create-marketplace-payment.dto';
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

  @Post('membership')
  createMembershipPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateMembershipPaymentDto,
  ) {
    return this.payments.createMembershipPaymentIntent(
      user.id,
      user.email,
      dto,
    );
  }

  @UseGuards(FeatureGuard)
  @RequiresFeature('MARKETPLACE_ENABLED')
  @Post('marketplace-orders/:orderId')
  createMarketplacePayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', new ParseUUIDPipe()) orderId: string,
  ) {
    return this.payments.createMarketplacePaymentIntent(
      user.id,
      user.email,
      { orderId },
    );
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
