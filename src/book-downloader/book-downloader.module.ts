import { Module } from '@nestjs/common';
import { BookDownloaderController } from './book-downloader.controller';
import { BookDownloaderService } from './book-downloader.service';
import { BookScraperService } from './services/book-scraper.service';
import { PageDownloaderService } from './services/page-downloader.service';
import { ArchiveService } from './services/archive.service';
import { BookResolverService } from './services/book-resolver.service';

@Module({
  controllers: [BookDownloaderController],
  providers: [
    BookDownloaderService,
    BookScraperService,
    PageDownloaderService,
    ArchiveService,
    BookResolverService,
  ],
  exports: [BookDownloaderService],
})
export class BookDownloaderModule {}
