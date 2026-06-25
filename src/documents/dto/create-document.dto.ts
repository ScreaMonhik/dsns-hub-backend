import { IsString, IsNotEmpty, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateDocumentDto {
  @ApiProperty({ description: 'Назва документа', example: 'Інструкція з пожежної безпеки' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({ description: 'ID підрозділу', format: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  departmentId!: string;
}