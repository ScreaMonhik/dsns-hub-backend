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
import { WsThrottlerGuard } from '../common/guards/ws-throttler.guard';
import { SendMessageDto, EditMessageDto, DeleteMessageDto, MarkAsReadDto } from './dto/chat-message.dto';

@WebSocketGateway({
  cors: { origin: '*' }, 
  namespace: '/chat',
})
@UseGuards(WsJwtGuard, WsThrottlerGuard)
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
    const user = client.data.user; 
    try {
      await this.chatService.getGroupMessages(groupId, user);
      client.join(groupId);
      return { status: 'ok', event: 'joined', groupId };
    } catch (error) {
      return { status: 'error', message: 'Access denied' };
    }
  }

  @SubscribeMessage('sendMessage')
  async handleSendMessage(@ConnectedSocket() client: Socket, @MessageBody() dto: SendMessageDto) {
    const user = client.data.user;
    try {
      const message = await this.chatService.saveMessage(dto.groupId, user, dto.content);
      this.server.to(dto.groupId).emit('newMessage', message);
      return { status: 'ok' };
    } catch (error: any) {
      return { status: 'error', message: error.message };
    }
  }

  @SubscribeMessage('editMessage')
  async handleEditMessage(@ConnectedSocket() client: Socket, @MessageBody() dto: EditMessageDto) {
    const user = client.data.user;
    try {
      const updatedMessage = await this.chatService.editMessage(dto.messageId, user, dto.newContent);
      this.server.to(updatedMessage.groupId).emit('messageUpdated', updatedMessage);
      return { status: 'ok' };
    } catch (error: any) {
      return { status: 'error', message: error.message };
    }
  }

  @SubscribeMessage('deleteMessage')
  async handleDeleteMessage(@ConnectedSocket() client: Socket, @MessageBody() dto: DeleteMessageDto) {
    const user = client.data.user;
    try {
      const deletedMessage = await this.chatService.deleteMessage(dto.messageId, user);
      this.server.to(deletedMessage.groupId).emit('messageDeleted', deletedMessage);
      return { status: 'ok' };
    } catch (error: any) {
      return { status: 'error', message: error.message };
    }
  }

  @SubscribeMessage('markAsRead')
  async handleMarkAsRead(@ConnectedSocket() client: Socket, @MessageBody() dto: MarkAsReadDto) {
    const user = client.data.user;
    try {
      await this.chatService.markMessagesAsRead(dto.groupId, user.sub, dto.messageIds);
      
      this.server.to(dto.groupId).emit('messagesRead', {
        groupId: dto.groupId,
        messageIds: dto.messageIds,
        readByUserId: user.sub,
      });
      
      return { status: 'ok' };
    } catch (error: any) {
      return { status: 'error', message: error.message };
    }
  }
}