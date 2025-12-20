import { Controller, Get, Req } from '@nestjs/common';
import { Request } from 'express';
import { EntitlementsService } from './entitlements.service';

@Controller('me')
export class MeController {
  constructor(private readonly entitlementsService: EntitlementsService) {}

  @Get('entitlements')
  async getEntitlements(@Req() req: Request) {
    const userId = (req as any).user?.id as string;
    return this.entitlementsService.getEntitlements(userId);
  }
}
