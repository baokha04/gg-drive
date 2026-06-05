import { Test, TestingModule } from '@nestjs/testing';
import { BookDownloaderService } from './book-downloader.service';
import { DatabaseService } from '../database/database.service';
import { GoogleDriveService } from '../google-drive/google-drive.service';
import axios from 'axios';

jest.mock('axios');

describe('BookDownloaderService', () => {
  let service: BookDownloaderService;

  const mockDbService = {
    get: jest.fn(),
    run: jest.fn(),
    query: jest.fn(),
    exec: jest.fn(),
  };

  const mockGoogleDriveService = {
    getFolderName: jest.fn().mockResolvedValue('Mock Folder Name'),
    uploadZip: jest.fn().mockResolvedValue('https://drive.google.com/file/d/mock_link/view'),
    mode: 'mock',
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
        { provide: GoogleDriveService, useValue: mockGoogleDriveService },
      ],
    }).compile();

    service = module.get<BookDownloaderService>(BookDownloaderService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('downloadAndStoreBooks', () => {
    it('should fail if title is already in DB', async () => {
      mockDbService.get.mockResolvedValueOnce({ id: 1 }); // Duplicate book exists

      const result = await service.downloadAndStoreBooks([
        'https://taphuan.nxbgd.vn/tap-huan/doc-sach/shs-toan-5-tap-mot.123456',
      ]);

      expect(result.failed.length).toBe(1);
      expect(result.failed[0].error).toContain('already exists in the system (Duplicate)');
      expect(result.success.length).toBe(0);
    });

    it('should fail if no images found matching olm CDN', async () => {
      mockDbService.get.mockResolvedValueOnce(null); // No duplicate
      mockDbService.get.mockResolvedValueOnce(null); // No folder mapping in DB

      const mockHtml = '<html><body>No CDN images here!</body></html>';
      (axios.get as jest.MockedFunction<typeof axios.get>).mockResolvedValueOnce({
        data: mockHtml,
      } as any);

      const result = await service.downloadAndStoreBooks([
        'https://taphuan.nxbgd.vn/tap-huan/doc-sach/shs-toan-5-tap-mot.123456',
      ]);

      expect(result.failed.length).toBe(1);
      expect(result.failed[0].error).toContain('No valid book image links');
      expect(result.success.length).toBe(0);
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
        { id: 1, page_number: 1, image_url: 'url-1', download_url: 'downloads/book_1/001.jpg', created_at: '2026-06-05', updated_at: '2026-06-05' }
      ]);

      const result = await service.findBookById(1);
      expect(result).toEqual({
        id: 1,
        title: 'book-1',
        pages: [
          { id: 1, page_number: 1, image_url: 'url-1', download_url: 'downloads/book_1/001.jpg', created_at: '2026-06-05', updated_at: '2026-06-05' }
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
      expect(mockDbService.run).toHaveBeenCalledTimes(3);
    });

    it('should return false if book does not exist', async () => {
      mockDbService.get.mockResolvedValueOnce(null);
      const result = await service.softDeleteBook(999);
      expect(result).toBe(false);
    });
  });
});
