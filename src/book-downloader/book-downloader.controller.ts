import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  BadRequestException,
  NotFoundException,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
} from '@nestjs/common';
import { BookDownloaderService } from './book-downloader.service';
import { DownloadBookDto } from './dto/download-book.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';
import { DeleteBookResponseDto } from './dto/download-response.dto';
import {
  BookListItemDto,
  BookDetailResponseDto,
} from './dto/book-list-item.dto';
import type { JobStep } from '../database/interfaces/database.interfaces';
import {
  QueueResponseDto,
  DownloadJobDto,
  StepsListDto,
  RetryStepDto,
} from './dto/download-job.dto';

@ApiTags('Books')
@Controller('api/books')
export class BookDownloaderController {
  constructor(private readonly bookDownloaderService: BookDownloaderService) {}

  @Post('download')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Scrape and archive books asynchronously via background queue',
  })
  @ApiBody({ type: DownloadBookDto })
  @ApiResponse({
    status: 200,
    description: 'List of queued download jobs.',
    type: QueueResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request body.' })
  async downloadBooks(
    @Body() body: DownloadBookDto,
  ): Promise<QueueResponseDto> {
    let urls: string[] = [];

    if (body.targetUrls && Array.isArray(body.targetUrls)) {
      urls = body.targetUrls.filter(
        (url) => typeof url === 'string' && url.trim().length > 0,
      );
    } else if (body.targetUrl && typeof body.targetUrl === 'string') {
      urls = [body.targetUrl];
    }

    if (urls.length === 0) {
      throw new BadRequestException(
        'At least one valid book URL must be provided in targetUrl or targetUrls.',
      );
    }

    const jobs = await this.bookDownloaderService.downloadAndStoreBooks(urls);

    return {
      success: true,
      message: 'Books queued for download.',
      jobs,
    };
  }

  @Post('download/catalog-pending')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Queue all pending book URLs from catalog_detail database table',
  })
  @ApiResponse({
    status: 200,
    description: 'List of queued download jobs.',
    type: QueueResponseDto,
  })
  async downloadCatalogPending(): Promise<QueueResponseDto> {
    const jobs = await this.bookDownloaderService.downloadPendingFromCatalog();

    if (jobs.length === 0) {
      return {
        success: true,
        message: 'No pending books found in catalog_detail.',
        jobs: [],
      };
    }

    return {
      success: true,
      message: `${jobs.length} pending books queued for download.`,
      jobs,
    };
  }

  @Post('download/retry/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retry a failed download job' })
  @ApiParam({
    name: 'id',
    description: 'Download job ID to retry',
    type: 'number',
  })
  @ApiResponse({
    status: 200,
    description: 'Job has been reset and re-queued for processing.',
    type: DownloadJobDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Job cannot be retried (not in failed state).',
  })
  @ApiResponse({ status: 404, description: 'Job not found.' })
  async retryJob(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<DownloadJobDto> {
    try {
      const job = await this.bookDownloaderService.retryJob(id);
      if (!job) {
        throw new NotFoundException(`Download job not found with ID: ${id}`);
      }
      return job;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(error.message);
    }
  }

  @Get('download/steps')
  @ApiOperation({ summary: 'Get the download pipeline step order' })
  @ApiResponse({
    status: 200,
    description: 'List of steps in the download pipeline.',
    type: StepsListDto,
  })
  getSteps(): StepsListDto {
    return this.bookDownloaderService.getStepsList();
  }

  @Post('download/retry/:id/step')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retry a failed job from a specific step' })
  @ApiParam({
    name: 'id',
    description: 'Download job ID to retry',
    type: 'number',
  })
  @ApiResponse({
    status: 200,
    description: 'Job has been reset and re-queued from the given step.',
    type: DownloadJobDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Job cannot be retried or invalid step.',
  })
  @ApiResponse({ status: 404, description: 'Job not found.' })
  async retryJobStep(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: RetryStepDto,
  ): Promise<DownloadJobDto> {
    if (!body.step) {
      throw new BadRequestException(
        'Step must be provided in the request body.',
      );
    }
    try {
      const job = await this.bookDownloaderService.retryJobStep(
        id,
        body.step as JobStep,
      );
      if (!job) {
        throw new NotFoundException(`Download job not found with ID: ${id}`);
      }
      return job;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new BadRequestException(error.message);
    }
  }

  @Get('download/jobs')
  @ApiOperation({
    summary: 'List all download jobs with optional status filter',
  })
  @ApiResponse({
    status: 200,
    description: 'List of download jobs.',
    type: [DownloadJobDto],
  })
  async getJobs(@Query('status') status?: string): Promise<DownloadJobDto[]> {
    return this.bookDownloaderService.findAllJobs(status);
  }

  @Get('download/status/:id')
  @ApiOperation({
    summary: 'Check status and download progress of a queued job',
  })
  @ApiParam({ name: 'id', description: 'Download job ID', type: 'number' })
  @ApiResponse({
    status: 200,
    description: 'Job status and progress retrieved successfully.',
    type: DownloadJobDto,
  })
  @ApiResponse({ status: 404, description: 'Job not found.' })
  async getJobStatus(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<DownloadJobDto> {
    const job = await this.bookDownloaderService.findJobById(id);
    if (!job) {
      throw new NotFoundException(`Download job not found with ID: ${id}`);
    }
    return job;
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
  @ApiOperation({
    summary: 'Get details of a specific book including pages list',
  })
  @ApiParam({ name: 'id', description: 'Internal book ID', type: 'number' })
  @ApiResponse({
    status: 200,
    description: 'Book details retrieved successfully.',
    type: BookDetailResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Book not found.' })
  async getBookById(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<BookDetailResponseDto> {
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
  async deleteBook(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<DeleteBookResponseDto> {
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
