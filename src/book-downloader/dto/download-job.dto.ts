import { ApiProperty } from '@nestjs/swagger';
import type { JobStep } from '../../database/interfaces/database.interfaces';

export class QueuedJobItemDto {
  @ApiProperty({
    description: 'The internal ID of the download job.',
    example: 1,
  })
  id: number;

  @ApiProperty({
    description: 'The URL of the book being downloaded.',
    example:
      'https://taphuan.nxbgd.vn/tap-huan/doc-sach/shs-toan-5-tap-mot.123456',
  })
  url: string;

  @ApiProperty({
    description: 'The current status of the download job.',
    example: 'pending',
    enum: ['pending', 'processing', 'completed', 'failed'],
  })
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

export class QueueResponseDto {
  @ApiProperty({
    description: 'Whether the queue request was successful.',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'Status message confirming job queuing.',
    example: 'Books queued for download.',
  })
  message: string;

  @ApiProperty({
    description: 'List of queued download jobs.',
    type: [QueuedJobItemDto],
  })
  jobs: QueuedJobItemDto[];
}

export class DownloadJobDto {
  @ApiProperty({
    description: 'The internal ID of the download job.',
    example: 1,
  })
  id: number;

  @ApiProperty({
    description: 'The URL of the book being downloaded.',
    example:
      'https://taphuan.nxbgd.vn/tap-huan/doc-sach/shs-toan-5-tap-mot.123456',
  })
  url: string;

  @ApiProperty({
    description: 'The current status of the download job.',
    example: 'processing',
    enum: ['pending', 'processing', 'completed', 'failed'],
  })
  status: 'pending' | 'processing' | 'completed' | 'failed';

  @ApiProperty({
    description: 'Total number of pages to download (0 until HTML is scraped).',
    example: 120,
  })
  total_pages: number;

  @ApiProperty({
    description: 'Number of pages currently downloaded.',
    example: 45,
  })
  current_page: number;

  @ApiProperty({
    description:
      'The generated database book ID (only present when status is completed).',
    example: 1,
    nullable: true,
  })
  book_id: number | null;

  @ApiProperty({
    description:
      'The error message explaining the failure (only present when status is failed).',
    example: 'Failed to access the book URL: request timed out.',
    nullable: true,
  })
  error_message: string | null;

  @ApiProperty({
    description: 'The current step of the download job pipeline.',
    example: 'DOWNLOAD_PAGES',
    enum: [
      'RESOLVE_BOOK',
      'SCRAPE_PAGES',
      'INIT_BOOK_RECORD',
      'DOWNLOAD_PAGES',
      'ZIP_DIRECTORY',
      'COMPLETED',
    ],
  })
  current_step: JobStep;

  @ApiProperty({
    description: 'The creation timestamp in database.',
    example: '2026-06-05 08:30:00',
  })
  created_at: string;

  @ApiProperty({
    description: 'The last update timestamp in database.',
    example: '2026-06-05 08:30:00',
  })
  updated_at: string;
}

export class StepsListDto {
  @ApiProperty({
    description: 'The download pipeline step order.',
    type: [String],
    example: [
      'RESOLVE_BOOK',
      'SCRAPE_PAGES',
      'INIT_BOOK_RECORD',
      'DOWNLOAD_PAGES',
      'ZIP_DIRECTORY',
    ],
  })
  steps: string[];
}

export class RetryStepDto {
  @ApiProperty({
    description: 'The step to retry from (must be in the pipeline).',
    example: 'DOWNLOAD_PAGES',
    enum: [
      'RESOLVE_BOOK',
      'SCRAPE_PAGES',
      'INIT_BOOK_RECORD',
      'DOWNLOAD_PAGES',
      'ZIP_DIRECTORY',
    ],
  })
  step: string;
}
