import { IsString, IsInt, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DepartmentReorderItemDto {
  @ApiProperty({ description: 'ID підрозділу', format: 'uuid' })
  @IsString()
  id!: string;

  @ApiPropertyOptional({ description: 'ID нового батьківського підрозділу', format: 'uuid', nullable: true })
  @IsString()
  @IsOptional()
  parentId?: string | null;

  @ApiProperty({ description: 'Новий індекс сортування', example: 0 })
  @IsInt()
  orderIndex!: number;
}

export class ReorderDepartmentsDto {
  @ApiProperty({ type: [DepartmentReorderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DepartmentReorderItemDto)
  items!: DepartmentReorderItemDto[];
}