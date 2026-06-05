import { ApiProperty } from '@nestjs/swagger';

export class DownloadSuccessItemDto {
  @ApiProperty({
    description: 'The URL of the processed book.',
    example:
      'https://taphuan.nxbgd.vn/tap-huan/doc-sach/shs-toan-5-tap-mot.123456',
  })
  url: string;

  @ApiProperty({
    description: 'The status of the processing.',
    example: 'Success',
  })
  status: 'Success';

  @ApiProperty({
    description: 'The generated database book ID.',
    example: 1,
  })
  bookId: number;

  @ApiProperty({
    description: 'The title of the book.',
    example: 'shs-toan-5-tap-mot',
  })
  bookTitle: string;

  @ApiProperty({
    description: 'Total number of pages scraped and downloaded.',
    example: 120,
  })
  totalPages: number;
}

export class DownloadFailedItemDto {
  @ApiProperty({
    description: 'The URL of the book that failed to process.',
    example:
      'https://taphuan.nxbgd.vn/tap-huan/doc-sach/shs-tieng-viet-5-tap-hai.4537689926',
  })
  url: string;

  @ApiProperty({
    description: 'The status of the processing.',
    example: 'Failed',
  })
  status: 'Failed';

  @ApiProperty({
    description: 'The error message explaining the failure reason.',
    example:
      'Book with title "shs-tieng-viet-5-tap-hai" already exists in the system (Duplicate).',
  })
  error: string;
}

export class DownloadResultsDto {
  @ApiProperty({
    description: 'List of successfully processed books.',
    type: [DownloadSuccessItemDto],
  })
  success: DownloadSuccessItemDto[];

  @ApiProperty({
    description: 'List of books that failed to process.',
    type: [DownloadFailedItemDto],
  })
  failed: DownloadFailedItemDto[];
}

export class DownloadResponseDto {
  @ApiProperty({
    description: 'Overall success indicator of the request.',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'Summary message of the processing results.',
    example: 'Processing completed. Success: 1/1',
  })
  message: string;

  @ApiProperty({
    description: 'Detailed results of success and failure groups.',
    type: DownloadResultsDto,
  })
  results: DownloadResultsDto;
}

export class DeleteBookResponseDto {
  @ApiProperty({
    description: 'Indicates if the book was successfully deleted.',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'A confirmation message.',
    example: 'Successfully deleted book with ID: 1',
  })
  message: string;
}
