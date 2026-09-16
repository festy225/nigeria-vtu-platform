import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { CurrencyCode } from '@nigeria-vtu-platform/shared';
import { WalletService } from './wallet.service';

@Controller('wallets')
export class WalletController {
  constructor(private readonly wallets: WalletService) {}
  @Get() balances(@CurrentUser() user: AuthenticatedUser) { return this.wallets.getBalances(user.id); }
  @Get('statement') statement(@CurrentUser() user: AuthenticatedUser, @Query('currency') currency?: CurrencyCode) { return this.wallets.getStatement(user.id, currency); }
  @Post(':walletId/transfer') transfer(@CurrentUser() user: AuthenticatedUser, @Param('walletId') walletId: string, @Body() body: { destinationWalletId: string; amountMinor: number; currency: CurrencyCode; idempotencyKey: string; description?: string }) { return this.wallets.transfer(user.id, walletId, body); }
}
