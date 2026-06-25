import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
    JwtModule.register({
      global: true, // Робимо JWT доступним глобально для зручності
      secret: 'super-secret-key', // В реальному проєкті ЦЕ МАЄ БУТИ В .env! (process.env.JWT_SECRET)
      signOptions: { expiresIn: '1d' }, // Токен живе 1 день
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
