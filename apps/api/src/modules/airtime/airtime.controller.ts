import { Body, Controller, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AirtimeService } from './airtime.service';
import { PurchaseAirtimeDto } from './airtime.dtos';

@Controller('airtime')
export class AirtimeController {
  constructor(
    private readonly airtime: AirtimeService,
  ) {}

  @Post('purchase')
  purchase(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PurchaseAirtimeDto,
  ) {
    return this.airtime.purchase(user.id, dto);
  }
}