import { IsString, IsNotEmpty, IsUUID, IsArray, ArrayMinSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePollDto {
  @ApiProperty({ description: 'Тема опитування', example: 'Оптимальний графік чергувань?' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({ description: 'ID підрозділу', format: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  departmentId!: string;

  @ApiProperty({ 
    description: 'Варіанти відповідей (мінімум 2)', 
    type: [String], 
    example: ['Доба через дві', 'Доба через три'] 
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(2)
  options!: string[];
}