import { Module } from '@nestjs/common';
import { FeatureCheckController } from './feature-check.controller';

@Module({ controllers: [FeatureCheckController] })
export class FeatureCheckModule {}
