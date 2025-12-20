import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { BillingService } from './billing.service';
import { BillingTier } from './billing.types';
import { EntitlementsService } from './entitlements.service';

@Controller('billing')
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly entitlementsService: EntitlementsService,
  ) {}

  @Post('checkout-session')
  async createCheckoutSession(@Req() req: Request, @Body('tier') tier: BillingTier) {
    const userId = (req as any).user?.id as string;
    return this.billingService.createCheckoutSession(userId, tier);
  }

  @Post('portal-session')
  async createPortalSession(@Req() req: Request) {
    const userId = (req as any).user?.id as string;
    return this.billingService.createPortalSession(userId);
  }

  @Get('tiers')
  async listTiers() {
    return this.billingService.getTiers();
  }

  @Post('webhook')
  async handleWebhook(@Req() req: Request) {
    const signature = req.headers['stripe-signature'] as string;
    await this.billingService.handleWebhook(req.body as Buffer, signature);
    return { received: true };
  }

  @Get('entitlements')
  async getEntitlements(@Req() req: Request) {
    const userId = (req as any).user?.id as string;
    return this.entitlementsService.getEntitlements(userId);
  }
}
