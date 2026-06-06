import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { BookDownloaderModule } from './book-downloader/book-downloader.module';
import { CatalogScraperModule } from './catalog-scraper/catalog-scraper.module';

@Module({
  imports: [DatabaseModule, BookDownloaderModule, CatalogScraperModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
