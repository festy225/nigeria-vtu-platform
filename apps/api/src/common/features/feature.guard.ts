import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FEATURE_KEY, RequiredFeature } from './feature.decorator';
import { FeatureService } from '../../modules/features/feature.service';

@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly features: FeatureService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<RequiredFeature>(
      FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required) {
      return true;
    }

    const featureKeys = Array.isArray(required) ? required : [required];

    for (const featureKey of featureKeys) {
      const enabled = await this.features.isEnabled(featureKey);

      if (!enabled) {
        throw new ServiceUnavailableException({
          code: 'FEATURE_DISABLED',
          message:
            'This service is temporarily unavailable. Please try again later.',
        });
      }
    }

    return true;
  }
}