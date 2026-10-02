import {
  IsEmail,
  IsOptional,
  IsPhoneNumber,
  IsString,
  IsStrongPassword,
} from 'class-validator';

export class RegisterDto {
  @IsString()
  name!: string;

  @IsEmail()
  email!: string;

  @IsPhoneNumber('NG')
  phone!: string;

  @IsString()
  @IsStrongPassword({
    minLength: 10,
    minUppercase: 1,
    minLowercase: 1,
    minNumbers: 1,
    minSymbols: 1,
  })
  password!: string;

  @IsString()
  confirmPassword!: string;
}
export class LoginDto {
  @IsString()
  identifier!: string;

  @IsString()
  password!: string;
}

export class RefreshDto {
  @IsString()
  refreshToken!: string;
}

export class LogoutDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

export class PasswordResetRequestDto {
  @IsString()
  identifier!: string;
}

export class PasswordResetDto {
  @IsString()
  token!: string;

  @IsStrongPassword({
    minLength: 10,
    minUppercase: 1,
    minLowercase: 1,
    minNumbers: 1,
    minSymbols: 1,
  })
  password!: string;
}

export class VerifyEmailDto {
  @IsString()
  token!: string;
}
export class VerifyPhoneDto {
  @IsString()
  token!: string;
}

export class ResendVerificationDto {
  @IsOptional()
  @IsString()
  identifier?: string;
}