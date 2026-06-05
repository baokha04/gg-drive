import { Test, TestingModule } from '@nestjs/testing';
import { BookDownloaderService } from './book-downloader.service';
import { DatabaseService } from '../database/database.service';
import { GoogleDriveService } from '../google-drive/google-drive.service';
import axios from 'axios';
import * as fs from 'fs';

jest.mock('axios');

describe('BookDownloaderService', () => {
  let service: BookDownloaderService;
  let dbService: DatabaseService;
  let driveService: GoogleDriveService;

  const mockDbService = {
    get: jest.fn(),
    run: jest.fn().mockResolvedValue({ lastID: 1, changes: 1 }),
    query: jest.fn(),
    exec: jest.fn(),
  };

  const mockGoogleDriveService = {
    getFolderName: jest.fn().mockResolvedValue('Mock Folder Name'),
    uploadZip: jest.fn().mockResolvedValue('https://drive.google.com/file/d/mock_link/view'),
    mode: 'mock',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookDownloaderService,
        { provide: DatabaseService, useValue: mockDbService },
        { provide: GoogleDriveService, useValue: mockGoogleDriveService },
      ],
    }).compile();

    service = module.get<BookDownloaderService>(BookDownloaderService);
    dbService = module.get<DatabaseService>(DatabaseService);
    driveService = module.get<GoogleDriveService>(GoogleDriveService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('downloadAndStoreBooks', () => {
    it('should fail if title is already in DB', async () => {
      mockDbService.get.mockResolvedValueOnce({ id: 1 }); // Duplicate book exists

      const result = await service.downloadAndStoreBooks(
        ['https://taphuan.nxbgd.vn/tap-huan/doc-sach/shs-toan-5-tap-mot.123456'],
        'folder-123',
      );

      expect(result.failed.length).toBe(1);
      expect(result.failed[0].error).toContain('đã tồn tại trong hệ thống (Trùng lặp)');
      expect(result.success.length).toBe(0);
    });

    it('should fail if no images found matching olm CDN', async () => {
      mockDbService.get.mockResolvedValueOnce(null); // No duplicate
      mockDbService.get.mockResolvedValueOnce(null); // No folder mapping in DB

      const mockHtml = '<html><body>No CDN images here!</body></html>';
      (axios.get as jest.MockedFunction<typeof axios.get>).mockResolvedValueOnce({
        data: mockHtml,
      } as any);

      const result = await service.downloadAndStoreBooks(
        ['https://taphuan.nxbgd.vn/tap-huan/doc-sach/shs-toan-5-tap-mot.123456'],
        'folder-123',
      );

      expect(result.failed.length).toBe(1);
      expect(result.failed[0].error).toContain('Không tìm thấy link ảnh sách hợp lệ');
      expect(result.success.length).toBe(0);
    });
  });
});
