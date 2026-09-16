import { SetMetadata } from '@nestjs/common';

export const FEATURE_KEY = 'requiredFeature';
export const RequiresFeature = (featureKey: string) => SetMetadata(FEATURE_KEY, featureKey);
