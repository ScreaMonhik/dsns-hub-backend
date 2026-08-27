import { PartialType } from '@nestjs/swagger';
import { CreateEmergencyBroadcastDto } from './create-emergency-broadcast.dto';

export class UpdateEmergencyBroadcastDto extends PartialType(CreateEmergencyBroadcastDto) {}
