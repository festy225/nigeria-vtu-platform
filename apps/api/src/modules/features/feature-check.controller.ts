import { Controller, Get, UseGuards } from '@nestjs/common';
import { FeatureGuard } from '../../common/features/feature.guard';
import { RequiresFeature } from '../../common/features/feature.decorator';

@Controller('feature-checks')
@UseGuards(FeatureGuard)
export class FeatureCheckController {
  @Get('airtime')
  @RequiresFeature('AIRTIME_ENABLED')
  airtime() {
    return { available: true, service: 'AIRTIME' };
  }

  @Get('transfers')
  @RequiresFeature('TRANSFERS_ENABLED')
  transfers() {
    return { available: true, capability: 'TRANSFERS' };
  }
}
