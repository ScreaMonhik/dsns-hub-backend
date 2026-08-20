import { IsEmail, IsNotEmpty, IsString, MinLength, Matches, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'admin@dsns.gov.ua', description: 'Службова пошта' })
  @IsEmail({}, { message: 'Некоректний формат email' })
  @IsNotEmpty({ message: 'Email не може бути порожнім' })
  email!: string;

  @ApiProperty({ example: 'SuperSecret1!', description: 'Пароль (мінімум 8 символів, велика та мала літера, цифра, спецсимвол)' })
  @IsString()
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/, {
    message: 'Пароль має містити щонайменше 8 символів, одну велику літеру, одну малу літеру, одну цифру та один спеціальний символ (@$!%*?&)',
  })
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

  @ApiPropertyOptional({ description: 'ID підрозділу', format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  departmentId?: string;
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