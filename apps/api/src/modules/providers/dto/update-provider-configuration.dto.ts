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
  @Matches(/^env:[A-Z][A-Z0-9_]*$/, { message: 'secretRef must use the env:VARIABLE_NAME format' })
  secretRef?: string;

  @IsOptional() @IsObject()
  config?: Record<string, unknown>;
}
