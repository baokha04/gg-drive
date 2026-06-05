import { Controller, Post, Body, BadRequestException, HttpCode, HttpStatus } from '@nestjs/common';
import { BookDownloaderService } from './book-downloader.service';
import { DownloadBookDto } from './dto/download-book.dto';

@Controller('api/books')
export class BookDownloaderController {
  constructor(private readonly bookDownloaderService: BookDownloaderService) {}

  @Post('download')
  @HttpCode(HttpStatus.OK)
  async downloadBooks(@Body() body: DownloadBookDto) {
    let urls: string[] = [];

    if (body.targetUrls && Array.isArray(body.targetUrls)) {
      urls = body.targetUrls.filter((url) => typeof url === 'string' && url.trim().length > 0);
    } else if (body.targetUrl && typeof body.targetUrl === 'string') {
      urls = [body.targetUrl];
    }

    if (urls.length === 0) {
      throw new BadRequestException(
        'Yêu cầu phải cung cấp ít nhất một đường dẫn sách hợp lệ trong targetUrl hoặc targetUrls.',
      );
    }

    const { success, failed } = await this.bookDownloaderService.downloadAndStoreBooks(
      urls,
      body.googleFolderId,
    );

    const totalProcessed = urls.length;
    const totalSuccess = success.length;

    return {
      success: true,
      message: `Đã xử lý xong. Thành công: ${totalSuccess}/${totalProcessed}`,
      results: {
        success,
        failed,
      },
    };
  }
}
