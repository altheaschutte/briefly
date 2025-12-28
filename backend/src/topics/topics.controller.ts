import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { TopicsService } from './topics.service';

@Controller('topics')
export class TopicsController {
  constructor(private readonly topicsService: TopicsService) {}

  @Get()
  async getTopics(
    @Req() req: Request,
    @Query('status') status?: string,
    @Query('is_active') isActiveParam?: string,
  ) {
    const userId = (req as any).user?.id as string;

    let isActive: boolean | undefined = undefined;
    if (status) {
      const normalized = status.toLowerCase();
      if (normalized === 'active') {
        isActive = true;
      } else if (normalized === 'inactive') {
        isActive = false;
      } else {
        throw new BadRequestException('status must be either "active" or "inactive"');
      }
    } else if (isActiveParam !== undefined) {
      const normalized = isActiveParam.toLowerCase();
      if (['true', '1'].includes(normalized)) {
        isActive = true;
      } else if (['false', '0'].includes(normalized)) {
        isActive = false;
      } else {
        throw new BadRequestException('is_active must be a boolean (true/false)');
      }
    }

    return this.topicsService.listTopics(userId, { isActive });
  }

  @Post()
  async createTopic(@Req() req: Request, @Body('original_text') originalText: string) {
    const userId = (req as any).user?.id as string;
    if (!originalText) {
      throw new BadRequestException('original_text is required');
    }
    return this.topicsService.createTopic(userId, originalText);
  }

  @Post('seed')
  async seedTopics(@Req() req: Request, @Body('user_about_context') userAboutContext: string) {
    const userId = (req as any).user?.id as string;
    return this.topicsService.generateSeedTopics(userId, userAboutContext);
  }

  @Patch(':id')
  async updateTopic(
    @Req() req: Request,
    @Param('id') id: string,
    @Body('original_text') originalText?: string,
    @Body('is_active') isActive?: boolean,
    @Body('order_index') orderIndex?: number,
  ) {
    const userId = (req as any).user?.id as string;
    return this.topicsService.updateTopic(userId, id, { originalText, isActive, orderIndex });
  }

  @Delete(':id')
  async deleteTopic(@Req() req: Request, @Param('id') id: string) {
    const userId = (req as any).user?.id as string;
    return this.topicsService.softDeleteTopic(userId, id);
  }
}
