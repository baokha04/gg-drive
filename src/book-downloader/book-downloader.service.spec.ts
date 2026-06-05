import { Test, TestingModule } from '@nestjs/testing';
import { BookDownloaderService } from './book-downloader.service';
import { DatabaseService } from '../database/database.service';
import { BookScraperService } from './services/book-scraper.service';
import { PageDownloaderService } from './services/page-downloader.service';
import { ArchiveService } from './services/archive.service';
import { BookResolverService } from './services/book-resolver.service';

describe('BookDownloaderService', () => {
  let service: BookDownloaderService;

  const mockDbService = {
    get: jest.fn(),
    run: jest.fn(),
    query: jest.fn(),
    exec: jest.fn(),
  };

  const mockScraper = {
    fetchHtml: jest.fn(),
    extractImageUrls: jest.fn(),
  };
  const mockPageDownloader = {
    downloadImageWithRetry: jest.fn(),
  };
  const mockArchive = {
    zipDirectory: jest.fn(),
  };
  const mockResolver = {
    findByUrl: jest.fn(),
    findByTitle: jest.fn(),
    getDownloadedPageNumbers: jest.fn(),
    createBook: jest.fn(),
    updateTotalPages: jest.fn(),
    recordPage: jest.fn(),
  };

  beforeEach(async () => {
    mockDbService.get.mockReset();
    mockDbService.run.mockReset();
    mockDbService.query.mockReset();
    mockDbService.exec.mockReset();
    mockScraper.fetchHtml.mockReset();
    mockScraper.extractImageUrls.mockReset();
    mockPageDownloader.downloadImageWithRetry.mockReset();
    mockArchive.zipDirectory.mockReset();
    mockResolver.findByUrl.mockReset();
    mockResolver.findByTitle.mockReset();
    mockResolver.getDownloadedPageNumbers.mockReset();
    mockResolver.createBook.mockReset();
    mockResolver.updateTotalPages.mockReset();
    mockResolver.recordPage.mockReset();

    mockDbService.run.mockResolvedValue({ lastID: 1, changes: 1 });
    mockDbService.get.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookDownloaderService,
        { provide: DatabaseService, useValue: mockDbService },
        { provide: BookScraperService, useValue: mockScraper },
        { provide: PageDownloaderService, useValue: mockPageDownloader },
        { provide: ArchiveService, useValue: mockArchive },
        { provide: BookResolverService, useValue: mockResolver },
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

  describe('getStepsList', () => {
    it('should return the pipeline step order', () => {
      const result = service.getStepsList();
      expect(result.steps).toEqual([
        'RESOLVE_BOOK',
        'SCRAPE_PAGES',
        'INIT_BOOK_RECORD',
        'DOWNLOAD_PAGES',
        'ZIP_DIRECTORY',
      ]);
    });

    it('should return a copy so callers cannot mutate the pipeline', () => {
      const first = service.getStepsList();
      first.steps.push('MUTATED');
      const second = service.getStepsList();
      expect(second.steps).not.toContain('MUTATED');
    });
  });

  describe('findAllJobs', () => {
    it('should query all jobs ordered by id desc when no status filter is provided', async () => {
      mockDbService.query.mockResolvedValueOnce([
        {
          id: 2,
          url: 'u2',
          status: 'failed',
          total_pages: 0,
          current_page: 0,
          book_id: null,
          error_message: 'boom',
          current_step: 'RESOLVE_BOOK',
          created_at: '2026-06-05',
          updated_at: '2026-06-05',
        },
        {
          id: 1,
          url: 'u1',
          status: 'completed',
          total_pages: 3,
          current_page: 3,
          book_id: 7,
          error_message: null,
          current_step: 'COMPLETED',
          created_at: '2026-06-05',
          updated_at: '2026-06-05',
        },
      ]);

      const result = await service.findAllJobs();
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(2);
      expect(result[0].error_message).toBe('boom');
      expect(result[1].id).toBe(1);
      expect(result[1].book_id).toBe(7);
      expect(mockDbService.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY id DESC'),
        [],
      );
    });

    it('should append a WHERE clause when status is provided', async () => {
      mockDbService.query.mockResolvedValueOnce([]);
      await service.findAllJobs('failed');
      expect(mockDbService.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE status = ?'),
        ['failed'],
      );
    });
  });

  describe('retryJob', () => {
    it('should return null when the job is not found', async () => {
      mockDbService.get.mockResolvedValueOnce(null);
      const result = await service.retryJob(42);
      expect(result).toBeNull();
    });

    it('should throw when the job is not in failed state', async () => {
      mockDbService.get.mockResolvedValueOnce({
        id: 1,
        url: 'u',
        status: 'completed',
      });
      await expect(service.retryJob(1)).rejects.toThrow(/cannot be retried/);
    });

    it('should reset status, clear error_message, and return the updated job', async () => {
      mockDbService.get.mockResolvedValueOnce({
        id: 1,
        url: 'u',
        status: 'failed',
      });
      mockDbService.run.mockResolvedValueOnce({ lastID: 0, changes: 1 });
      const refreshed = {
        id: 1,
        url: 'u',
        status: 'pending' as const,
        total_pages: 0,
        current_page: 0,
        book_id: null,
        error_message: null,
        current_step: 'RESOLVE_BOOK' as const,
        created_at: '2026-06-05',
        updated_at: '2026-06-05',
      };
      jest.spyOn(service, 'findJobById').mockResolvedValueOnce(refreshed);

      const result = await service.retryJob(1);
      expect(result?.status).toBe('pending');
      expect(mockDbService.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE download_job'),
        ['pending', 1],
      );
    });
  });

  describe('retryJobStep', () => {
    it('should return null when the job is not found', async () => {
      mockDbService.get.mockResolvedValueOnce(null);
      const result = await service.retryJobStep(1, 'SCRAPE_PAGES');
      expect(result).toBeNull();
    });

    it('should throw when the job is not in failed state', async () => {
      mockDbService.get.mockResolvedValueOnce({
        id: 1,
        url: 'u',
        status: 'processing',
      });
      await expect(service.retryJobStep(1, 'SCRAPE_PAGES')).rejects.toThrow(
        /cannot be retried/,
      );
    });

    it('should throw when the step is not in the pipeline', async () => {
      mockDbService.get.mockResolvedValueOnce({
        id: 1,
        url: 'u',
        status: 'failed',
      });
      await expect(
        service.retryJobStep(1, 'BOGUS_STEP' as any),
      ).rejects.toThrow(/Invalid step/);
    });

    it('should reset status, set current_step, and return the updated job for a valid step', async () => {
      mockDbService.get.mockResolvedValueOnce({
        id: 1,
        url: 'u',
        status: 'failed',
        book_id: 5,
        current_step: 'DOWNLOAD_PAGES',
      });
      mockDbService.run.mockResolvedValue({ lastID: 0, changes: 1 });
      const refreshed = {
        id: 1,
        url: 'u',
        status: 'pending' as const,
        total_pages: 3,
        current_page: 1,
        book_id: 5,
        error_message: null,
        current_step: 'DOWNLOAD_PAGES' as const,
        created_at: '2026-06-05',
        updated_at: '2026-06-05',
      };
      jest.spyOn(service, 'findJobById').mockResolvedValueOnce(refreshed);

      const result = await service.retryJobStep(1, 'DOWNLOAD_PAGES');
      expect(result?.status).toBe('pending');
      expect(result?.current_step).toBe('DOWNLOAD_PAGES');
    });
  });
});
