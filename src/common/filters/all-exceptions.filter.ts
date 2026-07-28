import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface RequestWithUser extends Request {
  user?: { sub: string; email?: string; role?: string };
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithUser>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | object = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        message = (exceptionResponse as Record<string, unknown>).message ?? exceptionResponse;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    const logContext = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      body: request.body,
      query: request.query,
      params: request.params,
      ip: request.ip,
      userId: request.user?.sub || 'unauthenticated',
    };

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `[${request.method}] ${request.url} - STATUS: ${status} - ERROR: ${
          typeof message === 'string' ? message : JSON.stringify(message)
        }\nCONTEXT: ${JSON.stringify(logContext)}\nSTACK: ${
          exception instanceof Error ? exception.stack : 'No stack trace'
        }`,
      );
    } else {
      this.logger.warn(
        `[${request.method}] ${request.url} - STATUS: ${status} - MSG: ${
          typeof message === 'string' ? message : JSON.stringify(message)
        } - USER: ${logContext.userId}`,
      );
    }

    const clientMessage =
      status >= HttpStatus.INTERNAL_SERVER_ERROR
        ? 'Internal server error. Please try again later or contact support.'
        : message;

    response.status(status).json({
      statusCode: status,
      timestamp: logContext.timestamp,
      path: request.url,
      message: clientMessage,
    });
  }
}