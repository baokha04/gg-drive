import { Test, TestingModule } from '@nestjs/testing';
import { CatalogScraperService } from './catalog-scraper.service';
import { BookScraperService } from '../../book-downloader/services/book-scraper.service';
import { DatabaseService } from '../../database/database.service';

describe('CatalogScraperService', () => {
  let service: CatalogScraperService;

  const mockBookScraper = {
    fetchHtml: jest.fn(),
  };

  const mockDatabaseService = {
    get: jest.fn(),
    run: jest.fn(),
    query: jest.fn(),
  };

  beforeEach(async () => {
    mockBookScraper.fetchHtml.mockReset();
    mockDatabaseService.get.mockReset();
    mockDatabaseService.run.mockReset();
    mockDatabaseService.query.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogScraperService,
        { provide: BookScraperService, useValue: mockBookScraper },
        { provide: DatabaseService, useValue: mockDatabaseService },
      ],
    }).compile();

    service = module.get<CatalogScraperService>(CatalogScraperService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('scrapeCatalogAndPersist', () => {
    it('should scrape single page, resolve publisher/grade, and persist pending reading URLs', async () => {
      const mockCatalogHtml = `
        <html>
          <body>
            [Chân trời sáng tạo](https://taphuan.nxbgd.vn/tap-huan/cac-bo-sach-khac?grade=6&id_book=3)
            [Cùng học để phát triển](https://taphuan.nxbgd.vn/tap-huan/cac-bo-sach-khac?grade=6&id_book=19927)
            
            <a href="/tap-huan/chi-tiet-sach/ngu-van-6-tap-mot-123">Ngữ văn 6, tập một</a>
            <a href="/tap-huan/cac-bo-sach-khac/page-2?grade=6&id_book=3">Page 2</a>
          </body>
        </html>
      `;
      const mockDetailHtml = `
        <html>
          <body>
            [SGK Ngữ văn 6, tập một](https://taphuan.nxbgd.vn/tap-huan/doc-sach/shs-ngu-van-6-tap-mot.111)
          </body>
        </html>
      `;

      mockBookScraper.fetchHtml.mockImplementation(async (url: string) => {
        if (url.includes('cac-bo-sach-khac')) {
          return mockCatalogHtml;
        }
        if (url.includes('chi-tiet-sach')) {
          return mockDetailHtml;
        }
        return '';
      });

      mockDatabaseService.get.mockResolvedValueOnce(null);
      mockDatabaseService.run.mockResolvedValueOnce({ lastID: 10, changes: 1 });

      mockDatabaseService.get.mockResolvedValueOnce(null);
      mockDatabaseService.run.mockResolvedValueOnce({ lastID: 20, changes: 1 });

      mockDatabaseService.get.mockResolvedValueOnce(null);

      const result = await service.scrapeCatalogAndPersist(
        'https://taphuan.nxbgd.vn/tap-huan/cac-bo-sach-khac/page-1?grade=6&id_book=3',
        false,
      );

      expect(result).toEqual({
        crawledPages: 1,
        foundBooks: 1,
        persistedPendingBooks: 1,
      });

      expect(mockDatabaseService.run).toHaveBeenCalledWith(
        'INSERT INTO catalog_grade (grade, name) VALUES (?, ?)',
        [6, 'Lớp 6'],
      );
      expect(mockDatabaseService.run).toHaveBeenCalledWith(
        'INSERT INTO catalog_publisher (publisher_id, name) VALUES (?, ?)',
        [3, 'Chân trời sáng tạo'],
      );
      expect(mockDatabaseService.run).toHaveBeenCalledWith(
        'INSERT INTO catalog_detail (catalog_grade_id, catalog_publisher_id, title, url, status) VALUES (?, ?, ?, ?, ?)',
        [
          10,
          20,
          'SGK Ngữ văn 6, tập một',
          'https://taphuan.nxbgd.vn/tap-huan/doc-sach/shs-ngu-van-6-tap-mot.111',
          'pending',
        ],
      );
    });
  });
});
