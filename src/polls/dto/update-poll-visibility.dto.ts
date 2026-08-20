import { IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePollVisibilityDto {
  @ApiProperty({ 
    description: 'Кількість місяців для продовження видимості архівного опитування. Якщо передати 0 — опитування негайно приховається від звичайних користувачів.', 
    example: 1 
  })
  @IsInt()
  @Min(0)
  extendMonths!: number;
}