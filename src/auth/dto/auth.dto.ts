import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'admin@dsns.gov.ua', description: 'Службова пошта' })
  @IsEmail({}, { message: 'Некоректний формат email' })
  @IsNotEmpty({ message: 'Email не може бути порожнім' })
  email!: string;

  @ApiProperty({ example: 'SuperSecretPassword123', description: 'Пароль (мінімум 6 символів)' })
  @IsString()
  @MinLength(6, { message: 'Пароль має містити щонайменше 6 символів' })
  @IsNotEmpty()
  password!: string;

  @ApiProperty({ example: 'Іван' })
  @IsString()
  @IsNotEmpty({ message: 'Ім\'я не може бути порожнім' })
  firstName!: string;

  @ApiProperty({ example: 'Іванов' })
  @IsString()
  @IsNotEmpty({ message: 'Прізвище не може бути порожнім' })
  lastName!: string;
}

export class LoginDto {
  @ApiProperty({ example: 'admin@dsns.gov.ua' })
  @IsEmail({}, { message: 'Некоректний формат email' })
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ example: 'SuperSecretPassword123' })
  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh Token' })
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}