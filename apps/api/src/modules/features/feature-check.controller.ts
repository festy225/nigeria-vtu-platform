import { Controller, Get } from '@nestjs/common';
import { RequiresFeature } from '../../common/features/feature.decorator';

@Controller('feature-checks')
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
