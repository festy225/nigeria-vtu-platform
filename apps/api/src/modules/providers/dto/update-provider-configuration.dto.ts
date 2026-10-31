import { IsBoolean, IsInt, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

export class UpdateProviderConfigurationDto {
  @IsOptional() @IsInt() @Min(1) @Max(32767)
  priority?: number;

  @IsOptional() @IsBoolean()
  isPrimary?: boolean;

  @IsOptional() @IsBoolean()
  isBackup?: boolean;

  @IsOptional() @IsBoolean()
  enabled?: boolean;

  @IsOptional() @IsString() @MinLength(1) @MaxLength(255)
  @Matches(/^(?:env:[A-Z][A-Z0-9_]*|vault:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}:api_secret)$/i, { message: 'secretRef must be an environment reference or a provider API-secret vault reference' })
  secretRef?: string;

  @IsOptional() @IsObject()
  config?: Record<string, unknown>;
}
