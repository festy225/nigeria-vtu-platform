import { IsBoolean } from 'class-validator';

export class UpdateFeatureToggleDto {
  @IsBoolean()
  enabled!: boolean;
}