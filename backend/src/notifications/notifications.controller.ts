import { Body, Controller, Delete, Param, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post('device')
  async registerDevice(
    @Req() req: Request,
    @Body('token') token: string,
    @Body('platform') platform = 'ios',
  ) {
    const userId = (req as any).user?.id as string;
    await this.notificationsService.registerDevice(userId, token, platform);
    return { success: true };
  }

  @Delete('device/:token')
  async deleteDevice(@Req() req: Request, @Param('token') token?: string) {
    const userId = (req as any).user?.id as string;
    if (token) {
      await this.notificationsService.unregisterDevice(userId, token);
    }
    return { success: true };
  }
}
