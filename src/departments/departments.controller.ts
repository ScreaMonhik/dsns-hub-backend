import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, UseInterceptors, Query, Res, ParseUUIDPipe } from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import { DepartmentsService } from './departments.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { QueryDepartmentDto } from './dto/query-department.dto';
import { ReorderDepartmentsDto } from './dto/reorder-departments.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';
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
  @Public()
  @ApiOperation({ summary: 'Отримати список підрозділів для екрану реєстрації (Публічний доступ)' })
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(3600000)
  @Get('public/tree')
  getPublicTree() {
    return this.departmentsService.findAllTree();
  }

  @Public()
  @ApiOperation({ summary: 'Публічний пошук підрозділів для екрану реєстрації (динамічний глибокий пошук)' })
  @Get('public/search')
  searchPublicDepartments(
    @Query('regionId', ParseUUIDPipe) regionId: string,
    @Query('search') search: string,
    @Query('limit') limit?: string,
  ) {
    const limitNumber = limit ? parseInt(limit, 10) : 50;
    const safeLimit = limitNumber > 50 ? 50 : limitNumber;
    return this.departmentsService.searchPublicDepartments(regionId, search, safeLimit);
  }

  @Public()
  @ApiOperation({ summary: 'Отримати список областей (ГУ ДСНС) для першого кроку реєстрації' })
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(3600000) // Кешуємо на 1 годину
  @Get('public/regions')
  getPublicRegions() {
    return this.departmentsService.getPublicRegions();
  }

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

  @ApiOperation({ summary: 'Експорт всієї структури у форматі JSON для переносу на Prod (SUPER_ADMIN)' })
  @Roles(Role.SUPER_ADMIN)
  @Get('export-json')
  async exportStructureJson(@Res() res) {
    const jsonString = await this.departmentsService.exportStructureJson();
    
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="org_structure.json"');
    
    return res.send(jsonString);
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