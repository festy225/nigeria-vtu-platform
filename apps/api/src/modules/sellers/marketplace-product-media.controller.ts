import {
  Controller, Delete, Get, Param, ParseUUIDPipe, Post, Req,
  UploadedFiles, UseInterceptors, UseGuards, StreamableFile, Res,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { Public } from '../../common/auth/auth.decorators';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { FeatureGuard } from '../../common/features/feature.guard';
import { RequiresFeature } from '../../common/features/feature.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { MarketplaceProductMediaService } from './marketplace-product-media.service';

@Controller()
@UseGuards(FeatureGuard)
export class MarketplaceProductMediaController {
  constructor(private readonly media: MarketplaceProductMediaService) {}

  @Post('sellers/products/:id/media')
  @RequiresFeature('SELLER_STORES_ENABLED')
  @UseInterceptors(FilesInterceptor('files', 10, {
    limits: { fileSize: 52428800, files: 10 },
  }))
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) productId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Req() request: Request,
  ) {
    return this.media.upload(user.id, productId, files, {
      ipAddress: request.ip,
      userAgent: request.get('user-agent') ?? undefined,
    });
  }

  @Get('sellers/products/:id/media')
  @RequiresFeature('SELLER_STORES_ENABLED')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) productId: string,
  ) {
    return this.media.listSellerMedia(user.id, productId);
  }

  @Delete('sellers/products/:id/media/:mediaId')
  @RequiresFeature('SELLER_STORES_ENABLED')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) productId: string,
    @Param('mediaId', new ParseUUIDPipe()) mediaId: string,
    @Req() request: Request,
  ) {
    return this.media.delete(user.id, productId, mediaId, {
      ipAddress: request.ip,
      userAgent: request.get('user-agent') ?? undefined,
    });
  }

  @Get('marketplace/products/:id/media/:mediaId')
  @Public()
  @RequiresFeature('MARKETPLACE_ENABLED')
  async publicMedia(
    @Param('id', new ParseUUIDPipe()) productId: string,
    @Param('mediaId', new ParseUUIDPipe()) mediaId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.media.getPublicMedia(productId, mediaId);
    response.setHeader('Content-Type', result.mimeType);
    response.setHeader('Content-Disposition', 'inline');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'public, max-age=300');
    return new StreamableFile(result.bytes);
  }
}