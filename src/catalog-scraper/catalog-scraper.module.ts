import { Module } from '@nestjs/common';
import { CatalogScraperController } from './catalog-scraper.controller';
import { CatalogScraperService } from './services/catalog-scraper.service';
import { BookDownloaderModule } from '../book-downloader/book-downloader.module';

@Module({
  imports: [BookDownloaderModule],
  controllers: [CatalogScraperController],
  providers: [CatalogScraperService],
  exports: [CatalogScraperService],
})
export class CatalogScraperModule {}
