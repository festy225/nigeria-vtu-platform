import { Module } from '@nestjs/common';
import { FeatureGuard } from '../../common/features/feature.guard';
import { FeatureCheckController } from './feature-check.controller';

@Module({ controllers: [FeatureCheckController], providers: [FeatureGuard] })
export class FeatureCheckModule {}
