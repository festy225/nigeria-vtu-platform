import { Injectable } from '@nestjs/common';
import type { ApiResponse } from '@nigeria-vtu-platform/shared';

@Injectable()
export class AppService {
  getHealth(): ApiResponse<{ status: string; app: string }> {
    return {
      success: true,
      data: {
        status: 'ok',
        app: 'nigeria-vtu-platform-api'
      }
    };
  }
}
