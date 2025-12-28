import { BadRequestException, Body, Controller, Get, Patch, Req } from '@nestjs/common';
import { Request } from 'express';
import { ProfilesService } from './profiles.service';
import { SchedulesService } from '../schedules/schedules.service';

@Controller('me/profile')
export class ProfilesController {
  constructor(
    private readonly profilesService: ProfilesService,
    private readonly schedulesService: SchedulesService,
  ) {}

  @Get()
  async getProfile(@Req() req: Request) {
    const userId = (req as any).user?.id as string;
    const profile = await this.profilesService.getProfile(userId);
    if (profile) {
      return profile;
    }
    const now = new Date();
    return {
      id: userId,
      firstName: 'Friend',
      intention: 'Not provided',
      userAboutContext: 'Not provided',
      timezone: 'Australia/Brisbane',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
  }

  @Patch()
  async updateProfile(@Req() req: Request, @Body('timezone') timezone?: string) {
    const userId = (req as any).user?.id as string;
    const tz = (timezone || '').trim();
    if (!tz) {
      throw new BadRequestException('timezone is required');
    }
    const profile = await this.profilesService.upsertTimezone(userId, tz);
    await this.schedulesService.recomputeForTimezone(userId, tz);
    return profile;
  }
}
