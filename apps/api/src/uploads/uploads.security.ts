import {
  ArgumentsHost,
  BadRequestException,
  CanActivate,
  Catch,
  ExceptionFilter,
  ExecutionContext,
  HttpException,
  Injectable,
  PayloadTooLargeException,
  UnauthorizedException
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { assertStaffAuthorized } from '../staff-auth/staff-auth';

const DEFAULT_MAX_FILES = 6;
const DEFAULT_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

function resolvePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export const uploadMaxFiles = resolvePositiveInt(
  process.env.UPLOAD_MAX_FILES,
  DEFAULT_MAX_FILES
);
export const uploadMaxFileSizeBytes = resolvePositiveInt(
  process.env.UPLOAD_MAX_FILE_SIZE_BYTES,
  DEFAULT_MAX_FILE_SIZE_BYTES
);
export const uploadMulterOptions = {
  limits: {
    files: uploadMaxFiles,
    fileSize: uploadMaxFileSizeBytes,
    fields: 0,
    parts: uploadMaxFiles,
    headerPairs: 100
  }
};

export type AuthenticatedUploadRequest = {
  headers?: Record<string, string | string[] | undefined>;
  customerOpenId?: string;
  staffOpenId?: string;
};

function readHeader(request: AuthenticatedUploadRequest, name: string) {
  const value = request.headers?.[name];
  return Array.isArray(value) ? value[0] : value;
}

@Injectable()
export class CustomerUploadAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedUploadRequest>();
    const customerOpenId = await this.authService.resolveCustomerOpenId(
      readHeader(request, 'authorization'),
      readHeader(request, 'x-customer-openid')
    );

    if (!customerOpenId) {
      throw new UnauthorizedException({
        error: 'Customer unauthorized',
        code: 'CUSTOMER_UNAUTHORIZED'
      });
    }

    request.customerOpenId = customerOpenId;
    return true;
  }
}

@Injectable()
export class StaffUploadAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedUploadRequest>();
    const staffOpenId = await this.authService.resolveStaffOpenId(
      readHeader(request, 'authorization'),
      readHeader(request, 'x-staff-openid')
    );

    request.staffOpenId = assertStaffAuthorized(staffOpenId);
    return true;
  }
}

@Catch(HttpException)
export class UploadHttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const status = exception.getStatus();
    const originalResponse = exception.getResponse();
    const message =
      typeof originalResponse === 'string'
        ? originalResponse
        : `${(originalResponse as { message?: unknown }).message || ''}`;
    let responseBody: unknown = originalResponse;

    if (exception instanceof PayloadTooLargeException && message === 'File too large') {
      responseBody = {
        error: 'Upload image is too large',
        code: 'UPLOAD_TOO_LARGE'
      };
    } else if (
      exception instanceof BadRequestException &&
      (message === 'Too many files' || message === 'Too many parts')
    ) {
      responseBody = {
        error: 'Too many files',
        code: 'UPLOAD_FILE_COUNT_EXCEEDED'
      };
    }

    host.switchToHttp().getResponse().status(status).json(responseBody);
  }
}
