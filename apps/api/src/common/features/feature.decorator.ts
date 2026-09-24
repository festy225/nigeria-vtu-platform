import { SetMetadata } from '@nestjs/common';

export const FEATURE_KEY = 'requiredFeature';

export type RequiredFeature = string | string[];

export const RequiresFeature = (featureKey: RequiredFeature) =>
  SetMetadata(FEATURE_KEY, featureKey);