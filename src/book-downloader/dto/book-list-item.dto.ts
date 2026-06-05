import { ApiProperty } from '@nestjs/swagger';

export class BookListItemDto {
  @ApiProperty({
    description: 'The internal ID of the book.',
    example: 1,
  })
  id: number;

  @ApiProperty({
    description: 'The title of the book.',
    example: 'shs-toan-5-tap-mot',
  })
  title: string;

  @ApiProperty({
    description: 'The description of the book.',
    example: 'Book downloaded from http...',
  })
  description: string;

  @ApiProperty({
    description: 'The title with Vietnamese accents removed.',
    example: 'shs-toan-5-tap-mot',
  })
  unsign_title: string;

  @ApiProperty({
    description: 'The source URL of the book.',
    example: 'http://example.com',
  })
  url: string;

  @ApiProperty({
    description: 'The total number of pages in the book.',
    example: 120,
  })
  total_pages: number;

  @ApiProperty({
    description: 'The Google Drive ZIP file link.',
    example: 'https://drive.google.com/...',
    nullable: true,
  })
  zip_file_url: string | null;

  @ApiProperty({
    description: 'The Google Drive folder ID.',
    example: '1a2b3c4d5e...',
    nullable: true,
  })
  google_folder_id: string | null;

  @ApiProperty({
    description: 'The Google Drive folder name.',
    example: 'Folder_1a2b3c',
    nullable: true,
  })
  google_folder_name: string | null;

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

export class BookPageDto {
  @ApiProperty({
    description: 'The internal ID of the page.',
    example: 1,
  })
  id: number;

  @ApiProperty({
    description: 'The page number.',
    example: 1,
  })
  page_number: number;

  @ApiProperty({
    description: 'The original source URL of the page image.',
    example: 'https://cdn3.olm.vn/...',
  })
  image_url: string;

  @ApiProperty({
    description: 'The relative download path on local disk.',
    example: 'downloads/book_1/001.jpg',
  })
  download_url: string;

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

export class BookDetailResponseDto extends BookListItemDto {
  @ApiProperty({
    description: 'The list of pages belonging to this book.',
    type: [BookPageDto],
  })
  pages: BookPageDto[];
}

