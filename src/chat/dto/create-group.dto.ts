import { IsString, IsNotEmpty, IsArray, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateGroupDto {
  @ApiProperty({ description: 'Назва чату/групи', example: 'Оперативний штаб' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ description: 'Список ID користувачів для додавання', type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  memberIds!: string[];
}