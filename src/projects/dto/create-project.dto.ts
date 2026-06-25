import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateProjectDto {
  @ApiProperty({ description: 'Назва проєкту', example: 'Оновлення системи оповіщення' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({ description: 'Опис проєкту', example: 'Пропоную замінити старі сирени на нові цифрові...' })
  @IsString()
  @IsNotEmpty()
  description!: string;
}