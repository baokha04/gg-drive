import { Module } from '@nestjs/common';
import { BookDownloaderController } from './book-downloader.controller';
import { BookDownloaderService } from './book-downloader.service';
import { GoogleDriveModule } from '../google-drive/google-drive.module';

@Module({
  imports: [GoogleDriveModule],
  controllers: [BookDownloaderController],
  providers: [BookDownloaderService],
})
export class BookDownloaderModule {}
