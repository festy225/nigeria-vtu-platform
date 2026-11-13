import {
  Body,
  Controller,
  Get,
  Req,
  UploadedFile,
  UseInterceptors,
  StreamableFile,
  Res,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../../common/auth/auth.decorators';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { FeatureGuard } from '../../common/features/feature.guard';
import { RequiresFeature } from '../../common/features/feature.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CreateSellerLocationDto } from './dto/create-seller-location.dto';
import {
  CreateMarketplaceProductDto,
} from './dto/create-marketplace-product.dto';
import {
  UpdateMarketplaceProductDto,
} from './dto/update-marketplace-product.dto';
import {
  CreateSellerApplicationDto,
  ReviewSellerApplicationDto,
} from './seller.dtos';
import { ReviewMarketplaceProductDto } from './dto/review-marketplace-product.dto';
import { SellerService } from './seller.service';
import { SellerApplicationDocumentService } from './seller-application-document.service';

@Controller('sellers')
@UseGuards(FeatureGuard)
export class SellerController {
  constructor(
    private readonly sellers: SellerService,
    private readonly documents: SellerApplicationDocumentService,
  ) {}

  @Get('application/documents')
  @RequiresFeature('SELLER_STORES_ENABLED')
  listApplicationDocuments(@CurrentUser() user: AuthenticatedUser) {
    return this.documents.list(user.id);
  }

  @Post('application/documents')
  @RequiresFeature('SELLER_STORES_ENABLED')
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 10485760, files: 1 },
  }))
  uploadApplicationDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Body('documentType') documentType:
      'IDENTITY_DOCUMENT' | 'CAC_CERTIFICATE' | 'BUSINESS_PROOF' | 'ADDRESS_PROOF',
    @UploadedFile() file: Express.Multer.File,
    @Req() request: Request,
  ) {
    return this.documents.upload(user.id, documentType, file, {
      ipAddress: request.ip,
      userAgent: request.get('user-agent') ?? undefined,
    });
  }

  @Get('applications/:id/documents/:documentId/download')
  @Roles('SUPER_ADMIN')
  @RequiresFeature('SELLER_STORES_ENABLED')
  async downloadApplicationDocument(
    @Param('id', new ParseUUIDPipe()) applicationId: string,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.documents.download(applicationId, documentId);
    response.setHeader('Content-Type', result.mimeType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(result.filename)}`,
    );
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(result.bytes);
  }

  @Patch('applications/:id/documents/:documentId/review')
  @Roles('SUPER_ADMIN')
  @RequiresFeature('SELLER_STORES_ENABLED')
  reviewApplicationDocument(
    @Param('id', new ParseUUIDPipe()) applicationId: string,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @CurrentUser() reviewer: AuthenticatedUser,
    @Body('decision') decision: 'ACCEPTED' | 'REJECTED',
    @Body('note') note: string | undefined,
    @Req() request: Request,
  ) {
    return this.documents.review(
      applicationId, documentId, reviewer.id, decision, note, {
        ipAddress: request.ip,
        userAgent: request.get('user-agent') ?? undefined,
      },
    );
  }

  @Get('applications')
  @Roles('SUPER_ADMIN')
  @RequiresFeature('SELLER_STORES_ENABLED')
  listApplications() {
    return this.sellers.listApplications();
  }

  @Get('applications/:id')
  @Roles('SUPER_ADMIN')
  @RequiresFeature('SELLER_STORES_ENABLED')
  getApplicationById(
    @Param('id', new ParseUUIDPipe()) applicationId: string,
  ) {
    return this.sellers.getApplicationById(applicationId);
  }

  @Patch('products/:id/moderation')
  @Roles('SUPER_ADMIN')
  @RequiresFeature('MARKETPLACE_ENABLED')
  moderateProduct(
    @Param('id', new ParseUUIDPipe()) productId: string,
    @CurrentUser() moderator: AuthenticatedUser,
    @Body() dto: ReviewMarketplaceProductDto,
  ) {
    return this.sellers.moderateProduct(productId, moderator.id, dto);
  }
  @Patch('applications/:id/review')
  @Roles('SUPER_ADMIN')
  @RequiresFeature('SELLER_STORES_ENABLED')
  reviewApplication(
    @Param('id', new ParseUUIDPipe()) applicationId: string,
    @CurrentUser() reviewer: AuthenticatedUser,
    @Body() dto: ReviewSellerApplicationDto,
  ) {
    return this.sellers.reviewApplication(
      applicationId,
      reviewer.id,
      dto,
    );
  }

  @Post('application')
  @RequiresFeature('SELLER_STORES_ENABLED')
  createApplication(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSellerApplicationDto,
  ) {
    return this.sellers.createApplication(user.id, dto);
  }

  @Patch('application')
  @RequiresFeature('SELLER_STORES_ENABLED')
  updateApplication(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSellerApplicationDto,
  ) {
    return this.sellers.updateApplication(user.id, dto);
  }

  @Post('application/submit')
  @RequiresFeature('SELLER_STORES_ENABLED')
  submitApplication(@CurrentUser() user: AuthenticatedUser) {
    return this.sellers.submitApplication(user.id);
  }

  @Get('application/eligibility')
  @RequiresFeature('SELLER_STORES_ENABLED')
  async getApplicationEligibility(@CurrentUser() user: AuthenticatedUser) {
    return {
      eligible: await this.sellers.isSellerApplicationEligible(user.id),
    };
  }

  @Post('upgrade/wholesaler/activate')
  @RequiresFeature('SELLER_STORES_ENABLED')
  activateWholesalerUpgrade(@CurrentUser() user: AuthenticatedUser) {
    return this.sellers.activateWholesalerUpgrade(user.id);
  }

  @Post('upgrade/distributor/activate')
  @RequiresFeature('SELLER_STORES_ENABLED')
  activateDistributorUpgrade(@CurrentUser() user: AuthenticatedUser) {
    return this.sellers.activateDistributorUpgrade(user.id);
  }

  @Post('membership/seller/activate')
  @RequiresFeature('SELLER_STORES_ENABLED')
  activateSellerMembership(@CurrentUser() user: AuthenticatedUser) {
    return this.sellers.activateSellerMembership(user.id);
  }

  @Get('application')
  @RequiresFeature('SELLER_STORES_ENABLED')
  getApplication(@CurrentUser() user: AuthenticatedUser) {
    return this.sellers.getApplication(user.id);
  }

  @Get('locations')
  @RequiresFeature('SELLER_STORES_ENABLED')
  listSellerLocations(@CurrentUser() user: AuthenticatedUser) {
    return this.sellers.listSellerLocations(user.id);
  }

  @Post('locations')
  @RequiresFeature('SELLER_STORES_ENABLED')
  createSellerLocation(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSellerLocationDto,
  ) {
    return this.sellers.createSellerLocation(user.id, dto);
  }

  @Post('products')
  @RequiresFeature('SELLER_STORES_ENABLED')
  createProduct(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateMarketplaceProductDto,
  ) {
    return this.sellers.createProduct(user.id, dto);
  }

  @Get('orders')
  @RequiresFeature('SELLER_STORES_ENABLED')
  listSellerOrders(@CurrentUser() user: AuthenticatedUser) {
    return this.sellers.listSellerOrders(user.id);
  }

  @Get('orders/:id')
  @RequiresFeature('SELLER_STORES_ENABLED')
  getSellerOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) orderId: string,
  ) {
    return this.sellers.getSellerOrder(user.id, orderId);
  }

  @Get('products')
  @RequiresFeature('SELLER_STORES_ENABLED')
  listSellerProducts(@CurrentUser() user: AuthenticatedUser) {
    return this.sellers.listSellerProducts(user.id);
  }

  @Get('products/:id')
  @RequiresFeature('SELLER_STORES_ENABLED')
  getSellerProduct(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) productId: string,
  ) {
    return this.sellers.getSellerProduct(user.id, productId);
  }

  @Patch('products/:id')
  @RequiresFeature('SELLER_STORES_ENABLED')
  updateSellerProduct(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) productId: string,
    @Body() dto: UpdateMarketplaceProductDto,
  ) {
    return this.sellers.updateSellerProduct(user.id, productId, dto);
  }
}
