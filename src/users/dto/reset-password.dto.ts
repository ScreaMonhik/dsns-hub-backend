import { IsString, MinLength, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({ description: 'Новий пароль для користувача', example: 'NewSecurePassword123' })
  @IsString()
  @MinLength(6, { message: 'Пароль має містити щонайменше 6 символів' })
  @IsNotEmpty()
  newPassword!: string;
}