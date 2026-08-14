import { IsString, IsNotEmpty, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({ description: 'Новий пароль для користувача', example: 'SuperSecret1!' })
  @IsString()
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/, {
    message: 'Пароль має містити щонайменше 8 символів, одну велику літеру, одну малу літеру, одну цифру та один спеціальний символ (@$!%*?&)',
  })
  @IsNotEmpty()
  newPassword!: string;
}