import { Test, TestingModule } from '@nestjs/testing';
import { BookDownloaderService } from './book-downloader.service';
import { DatabaseService } from '../database/database.service';

describe('BookDownloaderService', () => {
  let service: BookDownloaderService;

  const mockDbService = {
    get: jest.fn(),
    run: jest.fn(),
    query: jest.fn(),
    exec: jest.fn(),
  };

  beforeEach(async () => {
    // Reset all mock implementations to isolate tests
    mockDbService.get.mockReset();
    mockDbService.run.mockReset();
    mockDbService.query.mockReset();
    mockDbService.exec.mockReset();

    // Default mock behavior
    mockDbService.run.mockResolvedValue({ lastID: 1, changes: 1 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookDownloaderService,
        { provide: DatabaseService, useValue: mockDbService },
      ],
    }).compile();

    service = module.get<BookDownloaderService>(BookDownloaderService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('downloadAndStoreBooks', () => {
    it('should queue the target URLs and return immediately', async () => {
      mockDbService.run.mockResolvedValueOnce({ lastID: 10, changes: 1 });

      const result = await service.downloadAndStoreBooks([
        'https://taphuan.nxbgd.vn/tap-huan/doc-sach/shs-toan-5-tap-mot.123456',
      ]);

      expect(result).toEqual([
        {
          id: 10,
          url: 'https://taphuan.nxbgd.vn/tap-huan/doc-sach/shs-toan-5-tap-mot.123456',
          status: 'pending',
        },
      ]);
      expect(mockDbService.run).toHaveBeenCalledWith(
        'INSERT INTO download_job (url, status) VALUES (?, ?)',
        [
          'https://taphuan.nxbgd.vn/tap-huan/doc-sach/shs-toan-5-tap-mot.123456',
          'pending',
        ],
      );
    });
  });

  describe('findJobById', () => {
    it('should retrieve job details from database', async () => {
      mockDbService.get.mockResolvedValueOnce({
        id: 10,
        url: 'http://url',
        status: 'processing',
        total_pages: 50,
        current_page: 12,
        book_id: null,
        error_message: null,
        created_at: '2026-06-05',
        updated_at: '2026-06-05',
      });

      const result = await service.findJobById(10);
      expect(result).toEqual({
        id: 10,
        url: 'http://url',
        status: 'processing',
        total_pages: 50,
        current_page: 12,
        book_id: null,
        error_message: null,
        created_at: '2026-06-05',
        updated_at: '2026-06-05',
      });
    });

    it('should return null if job not found', async () => {
      mockDbService.get.mockResolvedValueOnce(null);
      const result = await service.findJobById(999);
      expect(result).toBeNull();
    });
  });

  describe('findAllBooks', () => {
    it('should query all books not marked deleted', async () => {
      mockDbService.query.mockResolvedValueOnce([{ id: 1, title: 'book-1' }]);
      const result = await service.findAllBooks();
      expect(result).toEqual([{ id: 1, title: 'book-1' }]);
      expect(mockDbService.query).toHaveBeenCalled();
    });
  });

  describe('findBookById', () => {
    it('should return book details and pages if exists', async () => {
      mockDbService.get.mockResolvedValueOnce({ id: 1, title: 'book-1' });
      mockDbService.query.mockResolvedValueOnce([
        {
          id: 1,
          page_number: 1,
          image_url: 'url-1',
          download_url: 'downloads/book_1/001.jpg',
          created_at: '2026-06-05',
          updated_at: '2026-06-05',
        },
      ]);

      const result = await service.findBookById(1);
      expect(result).toEqual({
        id: 1,
        title: 'book-1',
        pages: [
          {
            id: 1,
            page_number: 1,
            image_url: 'url-1',
            download_url: 'downloads/book_1/001.jpg',
            created_at: '2026-06-05',
            updated_at: '2026-06-05',
          },
        ],
      });
    });

    it('should return null if book does not exist', async () => {
      mockDbService.get.mockResolvedValueOnce(null);
      const result = await service.findBookById(999);
      expect(result).toBeNull();
    });
  });

  describe('softDeleteBook', () => {
    it('should return true and update deleted flags if book exists', async () => {
      mockDbService.get.mockResolvedValueOnce({ id: 1 });
      const result = await service.softDeleteBook(1);
      expect(result).toBe(true);
      expect(mockDbService.run).toHaveBeenCalledTimes(2);
    });

    it('should return false if book does not exist', async () => {
      mockDbService.get.mockResolvedValueOnce(null);
      const result = await service.softDeleteBook(999);
      expect(result).toBe(false);
    });
  });
});
