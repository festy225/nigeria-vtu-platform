import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  Req,
  UnauthorizedException,
  Patch} from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../../common/auth/auth.decorators';
import { FinanceService } from './finance.service';

type AuthenticatedRequest = Request & {
  user?: { sub?: string; id?: string; userId?: string };
};

@Controller('admin/finance')
@Roles('SUPER_ADMIN')
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get('overview')
  getOverview() {
    return this.finance.overview();
  }

  @Get('exchange-rates')
  getExchangeRates() {
    return this.finance.listExchangeRates();
  }

  @Post('exchange-rates')
  recordExchangeRate(
    @Body() body: {
      baseCurrency: string;
      quoteCurrency: string;
      rate: number;
      source: string;
      effectiveAt: string;
      reason?: string;
    },
    @Req() request: AuthenticatedRequest,
  ) {
    const actorId =
      request.user?.sub ?? request.user?.userId ?? request.user?.id;

    if (!actorId) {
      throw new UnauthorizedException('Authenticated user identifier is unavailable');
    }

    return this.finance.recordExchangeRate(body, actorId);
  }

  @Get('accounts')
  listAccounts() {
    return this.finance.listAccounts();
  }

  @Post('accounts')
  createAccount(
    @Body() body: {
      code: string;
      name: string;
      accountType: string;
      currency: string;
    },
    @Req() request: AuthenticatedRequest,
  ) {
    const actorId =
      request.user?.sub ?? request.user?.userId ?? request.user?.id;
    if (!actorId) {
      throw new UnauthorizedException(
        'Authenticated user identifier is unavailable',
      );
    }
    return this.finance.createAccount(body, actorId);
  }

  @Patch('accounts/:id/status')
  setAccountEnabled(
    @Param('id') accountId: string,
    @Body() body: { enabled: boolean },
    @Req() request: AuthenticatedRequest,
  ) {
    const actorId =
      request.user?.sub ?? request.user?.userId ?? request.user?.id;
    if (!actorId) {
      throw new UnauthorizedException(
        'Authenticated user identifier is unavailable',
      );
    }
    return this.finance.setAccountEnabled(accountId, body?.enabled, actorId);
  }

  @Get('journals')
  listJournals() {
    return this.finance.listJournals();
  }
  @Post('journals')
  postJournal(
    @Body() body: {
      reference: string;
      sourceType: string;
      sourceId: string;
      currency: string;
      description: string;
      postings: Array<{
        debitAccountId: string;
        creditAccountId: string;
        amountMinor: number;
        description?: string;
      }>;
    },
    @Req() request: AuthenticatedRequest,
  ) {
    const actorId =
      request.user?.sub ?? request.user?.userId ?? request.user?.id;

    if (!actorId) {
      throw new UnauthorizedException(
        'Authenticated user identifier is unavailable',
      );
    }

    return this.finance.postJournal(body, actorId);
  }

  @Post('journals/:id/reversals')
  reverseJournal(
    @Body() body: { reference: string; reason: string },
    @Req() request: AuthenticatedRequest,
    @Param('id') journalId: string,
  ) {
    const actorId =
      request.user?.sub ?? request.user?.userId ?? request.user?.id;

    if (!actorId) {
      throw new UnauthorizedException(
        'Authenticated user identifier is unavailable',
      );
    }

    return this.finance.reverseJournal(journalId, body, actorId);
  }
}
