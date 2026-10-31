import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
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
  @Matches(/^(?:env:[A-Z][A-Z0-9_]*|vault:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}:api_secret)$/i, {
    message: 'secretRef must use the env:VARIABLE_NAME format',
  })
  secretRef!: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}
