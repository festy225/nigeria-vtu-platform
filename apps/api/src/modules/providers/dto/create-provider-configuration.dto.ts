import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateProviderConfigurationDto {
  @IsUUID()
  providerId!: string;

  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @IsInt()
  @Min(1)
  @Max(32767)
  priority!: number;

  @IsBoolean()
  isPrimary!: boolean;

  @IsBoolean()
  isBackup!: boolean;

  @IsBoolean()
  enabled!: boolean;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  secretRef!: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}
