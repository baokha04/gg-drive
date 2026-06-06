import {
  Controller,
  Post,
  Body,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { CatalogScraperService } from './services/catalog-scraper.service';
import { CatalogScrapeDto } from './dto/catalog-scrape.dto';

@ApiTags('Catalog Scraper')
@Controller('api/catalog')
export class CatalogScraperController {
  constructor(private readonly catalogScraperService: CatalogScraperService) {}

  @Post('scrape')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Scrape a taphuan catalog and persist grades, publishers, and book links to DB',
  })
  @ApiBody({ type: CatalogScrapeDto })
  @ApiResponse({
    status: 200,
    description: 'Catalog successfully scraped and persisted.',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request body or missing params.',
  })
  async scrapeCatalog(@Body() body: CatalogScrapeDto): Promise<{
    success: boolean;
    crawledPages: number;
    foundBooks: number;
    persistedPendingBooks: number;
  }> {
    if (
      !body.catalogUrl ||
      typeof body.catalogUrl !== 'string' ||
      body.catalogUrl.trim().length === 0
    ) {
      throw new BadRequestException('Catalog URL must be provided.');
    }

    try {
      const crawlAllPages = body.crawlAllPages ?? false;
      const result = await this.catalogScraperService.scrapeCatalogAndPersist(
        body.catalogUrl,
        crawlAllPages,
      );

      return {
        success: true,
        ...result,
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }
}
