import { IsString, IsNotEmpty, IsUUID } from 'class-validator';

export class SendMessageDto {
  @IsUUID()
  @IsNotEmpty()
  groupId!: string;

  @IsString()
  @IsNotEmpty()
  content!: string;
}

export class EditMessageDto {
  @IsUUID()
  @IsNotEmpty()
  messageId!: string;

  @IsString()
  @IsNotEmpty()
  newContent!: string;
}

export class DeleteMessageDto {
  @IsUUID()
  @IsNotEmpty()
  messageId!: string;
}

export class MarkAsReadDto {
  @IsUUID('4')
  @IsNotEmpty()
  groupId!: string;

  @IsString({ each: true })
  @IsNotEmpty()
  messageIds!: string[];
}