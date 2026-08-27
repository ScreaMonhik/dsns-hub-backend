import { Module } from '@nestjs/common';
import { EmergencyBroadcastsService } from './emergency-broadcasts.service';
import { EmergencyBroadcastsController } from './emergency-broadcasts.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [EmergencyBroadcastsController],
  providers: [EmergencyBroadcastsService],
})
export class EmergencyBroadcastsModule {}