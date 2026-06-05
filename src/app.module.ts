import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { BookDownloaderModule } from './book-downloader/book-downloader.module';

@Module({
  imports: [DatabaseModule, BookDownloaderModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
