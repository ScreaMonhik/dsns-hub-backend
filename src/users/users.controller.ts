import { 
  Controller, 
  Get, 
  Patch, 
  Delete, 
  Post, 
  Body, 
  Param, 
  Query, 
  UseGuards, 
  ParseIntPipe, 
  DefaultValuePipe, 
  Req, 
  UseInterceptors, 
  UploadedFile, 
  ParseFilePipe, 
  MaxFileSizeValidator, 
  FileTypeValidator 
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { UpdateUserDto } from './dto/update-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

interface RequestWithUser extends Request {
  user: {
    sub: string;
    email: string;
    role: Role;
  };
}

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @ApiOperation({ summary: 'Отримати список користувачів з пагінацією та пошуком (Тільки ADMIN)' })
  @Roles(Role.ADMIN)
  @Get()
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('search') search?: string,
  ) {
    return this.usersService.findAll(page, limit, search);
  }

  @ApiOperation({ summary: 'Отримати профіль поточного користувача' })
  @Get('me')
  async getMe(@Req() req: RequestWithUser) {
    return this.usersService.getMe(req.user.sub);
  }

  @ApiOperation({ summary: 'Оновити аватар поточного користувача' })
  @Patch('me/avatar')
  @UseInterceptors(FileInterceptor('file'))
  async updateAvatar(
    @Req() req: RequestWithUser,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: '.(png|jpeg|jpg|webp)' }),
        ],
      }),
    ) file: Express.Multer.File,
  ) {
    return this.usersService.updateAvatar(req.user.sub, file);
  }

  @ApiOperation({ summary: 'Редагувати дані або статус блокування користувача (Тільки ADMIN)' })
  @Roles(Role.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @ApiOperation({ summary: 'Повністю видалити користувача з бази даних (Тільки ADMIN)' })
  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }

  @ApiOperation({ summary: 'Скинути пароль користувача вручну (Тільки ADMIN)' })
  @Roles(Role.ADMIN)
  @Post(':id/reset-password')
  resetPassword(@Param('id') id: string, @Body() dto: ResetPasswordDto) {
    return this.usersService.resetPassword(id, dto.newPassword);
  }
}