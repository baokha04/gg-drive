import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CatalogScrapeDto {
  @ApiProperty({
    description: 'The taphuan catalog URL to scrape.',
    example:
      'https://taphuan.nxbgd.vn/tap-huan/cac-bo-sach-khac/page-1?grade=6&id_book=3',
  })
  catalogUrl: string;

  @ApiPropertyOptional({
    description: 'Whether to scrape all pages in the pagination list.',
    default: false,
    example: true,
  })
  crawlAllPages?: boolean;
}
