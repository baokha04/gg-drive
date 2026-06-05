import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  BadRequestException,
  NotFoundException,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
} from '@nestjs/common';
import { BookDownloaderService } from './book-downloader.service';
import { DownloadBookDto } from './dto/download-book.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiParam } from '@nestjs/swagger';
import { DownloadResponseDto, DeleteBookResponseDto } from './dto/download-response.dto';
import { BookListItemDto, BookDetailResponseDto } from './dto/book-list-item.dto';

@ApiTags('Books')
@Controller('api/books')
export class BookDownloaderController {
  constructor(private readonly bookDownloaderService: BookDownloaderService) {}

  @Post('download')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Scrape and archive books, then upload to Google Drive' })
  @ApiBody({ type: DownloadBookDto })
  @ApiResponse({
    status: 200,
    description: 'Process result for all target book URLs.',
    type: DownloadResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request body.' })
  async downloadBooks(@Body() body: DownloadBookDto): Promise<DownloadResponseDto> {
    let urls: string[] = [];

    if (body.targetUrls && Array.isArray(body.targetUrls)) {
      urls = body.targetUrls.filter((url) => typeof url === 'string' && url.trim().length > 0);
    } else if (body.targetUrl && typeof body.targetUrl === 'string') {
      urls = [body.targetUrl];
    }

    if (urls.length === 0) {
      throw new BadRequestException(
        'At least one valid book URL must be provided in targetUrl or targetUrls.',
      );
    }

    const { success, failed } = await this.bookDownloaderService.downloadAndStoreBooks(urls);

    const totalProcessed = urls.length;
    const totalSuccess = success.length;

    return {
      success: true,
      message: `Processing completed. Success: ${totalSuccess}/${totalProcessed}`,
      results: {
        success,
        failed,
      },
    };
  }

  @Get()
  @ApiOperation({ summary: 'Get list of all downloaded books' })
  @ApiResponse({
    status: 200,
    description: 'List of books retrieved successfully.',
    type: [BookListItemDto],
  })
  async getBooks(): Promise<BookListItemDto[]> {
    return this.bookDownloaderService.findAllBooks();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get details of a specific book including pages list' })
  @ApiParam({ name: 'id', description: 'Internal book ID', type: 'number' })
  @ApiResponse({
    status: 200,
    description: 'Book details retrieved successfully.',
    type: BookDetailResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Book not found.' })
  async getBookById(@Param('id', ParseIntPipe) id: number): Promise<BookDetailResponseDto> {
    const book = await this.bookDownloaderService.findBookById(id);
    if (!book) {
      throw new NotFoundException(`Book not found with ID: ${id}`);
    }
    return book;
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a book and its related records' })
  @ApiParam({ name: 'id', description: 'Internal book ID', type: 'number' })
  @ApiResponse({
    status: 200,
    description: 'Book soft-deleted successfully.',
    type: DeleteBookResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Book not found.' })
  async deleteBook(@Param('id', ParseIntPipe) id: number): Promise<DeleteBookResponseDto> {
    const success = await this.bookDownloaderService.softDeleteBook(id);
    if (!success) {
      throw new NotFoundException(`Book not found with ID: ${id}`);
    }
    return {
      success: true,
      message: `Successfully deleted book with ID: ${id}`,
    };
  }
}
