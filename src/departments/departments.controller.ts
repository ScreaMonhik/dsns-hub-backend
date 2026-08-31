import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, UseInterceptors, Query } from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import { DepartmentsService } from './departments.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { QueryDepartmentDto } from './dto/query-department.dto';
import { ReorderDepartmentsDto } from './dto/reorder-departments.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('Departments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @ApiOperation({ summary: 'Створити новий підрозділ (ADMIN, SUPER_ADMIN)' })
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Post()
  create(@Body() dto: CreateDepartmentDto) {
    return this.departmentsService.create(dto);
  }

  @ApiOperation({ summary: 'Отримати список підрозділів (з пагінацією та пошуком)' })
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(3600000) // NestJS автоматично згенерує ключ кешу на основі URL з query-параметрами
  @ApiOperation({ summary: 'Отримати повне дерево підрозділів без пагінації (SUPER_ADMIN)' })
  @Roles(Role.SUPER_ADMIN)
  @Get('all')
  findAllTree() {
    return this.departmentsService.findAllTree();
  }

  @ApiOperation({ summary: 'Масове оновлення порядку підрозділів після Drag-and-Drop (SUPER_ADMIN)' })
  @Roles(Role.SUPER_ADMIN)
  @Patch('reorder')
  reorder(@Body() dto: ReorderDepartmentsDto) {
    return this.departmentsService.reorder(dto.items);
  }

  @Get()
  findAll(@Query() query: QueryDepartmentDto) {
    return this.departmentsService.findAll(query);
  }

  @ApiOperation({ summary: 'Перейменувати або перемістити підрозділ (SUPER_ADMIN)' })
  @Roles(Role.SUPER_ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDepartmentDto) {
    return this.departmentsService.update(id, dto);
  }

  @ApiOperation({ summary: 'Видалити підрозділ (SUPER_ADMIN)' })
  @Roles(Role.SUPER_ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.departmentsService.remove(id);
  }
}