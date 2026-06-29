import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateCategoryDto {
  @ApiProperty({ description: 'Нова назва категорії', example: 'Технічна служба' })
  @IsString()
  @IsNotEmpty()
  name!: string;
}