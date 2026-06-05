import { ApiPropertyOptional } from '@nestjs/swagger';

export class DownloadBookDto {
  @ApiPropertyOptional({
    description: 'A single URL of the book to download.',
    example:
      'https://taphuan.nxbgd.vn/tap-huan/doc-sach/shs-toan-5-tap-mot.123456',
  })
  targetUrl?: string;

  @ApiPropertyOptional({
    description: 'An array of book URLs to download in bulk.',
    type: [String],
    example: [
      'https://taphuan.nxbgd.vn/tap-huan/doc-sach/shs-tieng-viet-5-tap-hai.4537689926',
      'https://taphuan.nxbgd.vn/tap-huan/doc-sach/shs-toan-5-tap-mot.123456',
    ],
  })
  targetUrls?: string[];
}
