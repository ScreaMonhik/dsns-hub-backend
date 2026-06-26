import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards } from '@nestjs/common';
import { ChatService } from './chat.service';
import { WsJwtGuard } from '../auth/guards/ws-jwt.guard';
import { SendMessageDto, EditMessageDto, DeleteMessageDto } from './dto/chat-message.dto';

@WebSocketGateway({
  cors: { origin: '*' }, // В продакшені змінити на домен адмінки/додатку
  namespace: '/chat',
})
@UseGuards(WsJwtGuard)
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(private readonly chatService: ChatService) {}

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('joinRoom')
  async handleJoinRoom(@ConnectedSocket() client: Socket, @MessageBody('groupId') groupId: string) {
    const userId = client.data.user.sub;
    try {
      // Підключення до кімнати socket.io після перевірки членства
      await this.chatService.getGroupMessages(groupId, userId);
      client.join(groupId);
      return { status: 'ok', event: 'joined', groupId };
    } catch (error) {
      return { status: 'error', message: 'Access denied' };
    }
  }

  @SubscribeMessage('sendMessage')
  async handleSendMessage(@ConnectedSocket() client: Socket, @MessageBody() dto: SendMessageDto) {
    const userId = client.data.user.sub;
    try {
      const message = await this.chatService.saveMessage(dto.groupId, userId, dto.content);
      this.server.to(dto.groupId).emit('newMessage', message);
      return { status: 'ok' };
    } catch (error: any) {
      return { status: 'error', message: error.message };
    }
  }

  @SubscribeMessage('editMessage')
  async handleEditMessage(@ConnectedSocket() client: Socket, @MessageBody() dto: EditMessageDto) {
    const userId = client.data.user.sub;
    try {
      const updatedMessage = await this.chatService.editMessage(dto.messageId, userId, dto.newContent);
      this.server.to(updatedMessage.groupId).emit('messageUpdated', updatedMessage);
      return { status: 'ok' };
    } catch (error: any) {
      return { status: 'error', message: error.message };
    }
  }

  @SubscribeMessage('deleteMessage')
  async handleDeleteMessage(@ConnectedSocket() client: Socket, @MessageBody() dto: DeleteMessageDto) {
    const userId = client.data.user.sub;
    try {
      const deletedMessage = await this.chatService.deleteMessage(dto.messageId, userId);
      this.server.to(deletedMessage.groupId).emit('messageDeleted', deletedMessage);
      return { status: 'ok' };
    } catch (error: any) {
      return { status: 'error', message: error.message };
    }
  }
}