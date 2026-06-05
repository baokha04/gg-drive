import { Module } from '@nestjs/common';
import { BookDownloaderController } from './book-downloader.controller';
import { BookDownloaderService } from './book-downloader.service';

@Module({
  controllers: [BookDownloaderController],
  providers: [BookDownloaderService],
  exports: [BookDownloaderService],
})
export class BookDownloaderModule {}
