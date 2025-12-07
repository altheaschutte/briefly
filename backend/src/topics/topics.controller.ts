import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { TopicsService } from './topics.service';

@Controller('topics')
export class TopicsController {
  constructor(private readonly topicsService: TopicsService) {}

  @Get()
  async getTopics(@Req() req: Request) {
    const userId = (req as any).user?.id as string;
    return this.topicsService.listTopics(userId);
  }

  @Post()
  async createTopic(@Req() req: Request, @Body('original_text') originalText: string) {
    const userId = (req as any).user?.id as string;
    if (!originalText) {
      throw new BadRequestException('original_text is required');
    }
    return this.topicsService.createTopic(userId, originalText);
  }

  @Patch(':id')
  async updateTopic(
    @Req() req: Request,
    @Param('id') id: string,
    @Body('original_text') originalText?: string,
    @Body('is_active') isActive?: boolean,
  ) {
    const userId = (req as any).user?.id as string;
    return this.topicsService.updateTopic(userId, id, { originalText, isActive });
  }

  @Delete(':id')
  async deleteTopic(@Req() req: Request, @Param('id') id: string) {
    const userId = (req as any).user?.id as string;
    return this.topicsService.softDeleteTopic(userId, id);
  }
}
