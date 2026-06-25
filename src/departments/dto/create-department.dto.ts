import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateDepartmentDto {
  @ApiProperty({ description: 'Назва підрозділу', example: 'ГУ ДСНС у Київській області' })
  @IsString()
  @IsNotEmpty()
  name!: string;
}