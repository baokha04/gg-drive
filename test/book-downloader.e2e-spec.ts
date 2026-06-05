import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { DatabaseService } from '../src/database/database.service';
import { GoogleDriveService } from '../src/google-drive/google-drive.service';
import axios from 'axios';
import * as sqlite3 from 'sqlite3';
import { Readable } from 'stream';

// Mock axios
jest.mock('axios', () => {
  const mockAxios: any = jest.fn((config) => {
    // Return mock readable stream for image download
    const readable = new Readable();
    readable.push('dummy_image_content');
    readable.push(null);
    return Promise.resolve({ data: readable });
  });
  mockAxios.get = jest.fn();
  mockAxios.isAxiosError = jest.fn().mockReturnValue(false);
  return mockAxios;
});

// Override DatabaseService to run in-memory for isolated E2E tests
class TestDatabaseService extends DatabaseService {
  override async onModuleInit() {
    (this as any).db = new sqlite3.Database(':memory:');
    await (this as any).initSchema();
  }
}

describe('BookDownloaderController (e2e)', () => {
  let app: INestApplication;
  let dbService: DatabaseService;

  const mockGoogleDriveService = {
    getFolderName: jest.fn().mockResolvedValue('Mock Folder Name'),
    uploadZip: jest.fn().mockResolvedValue('https://drive.google.com/file/d/mock_link/view'),
    mode: 'mock',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useClass(TestDatabaseService)
      .overrideProvider(GoogleDriveService)
      .useValue(mockGoogleDriveService)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dbService = moduleFixture.get<DatabaseService>(DatabaseService);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /api/books/download', () => {
    it('should return 400 status if request payload is empty', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/books/download')
        .send({})
        .expect(400);

      expect(response.body.message).toContain('At least one valid book URL must be provided');
    });

    it('should process a single book url successfully and persist in database', async () => {
      const mockHtml = `
        <html>
          <body>
            <img src="https://cdn3.olm.vn/book/page1.jpg" />
            <img src="https://cdn3.olm.vn/book/page2.png" />
          </body>
        </html>
      `;
      (axios.get as jest.Mock).mockResolvedValueOnce({ data: mockHtml });

      const response = await request(app.getHttpServer())
        .post('/api/books/download')
        .send({
          targetUrl: 'https://taphuan.nxbgd.vn/tap-huan/doc-sach/shs-toan-5-tap-mot.123456',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Success: 1/1');
      expect(response.body.results.success.length).toBe(1);
      expect(response.body.results.success[0]).toEqual({
        url: 'https://taphuan.nxbgd.vn/tap-huan/doc-sach/shs-toan-5-tap-mot.123456',
        status: 'Success',
        bookId: 1,
        bookTitle: 'shs-toan-5-tap-mot',
        totalPages: 2,
        googleFolderId: null,
        driveLink: 'https://drive.google.com/file/d/mock_link/view',
      });

      // Verify db persistence
      const book = await dbService.get('SELECT * FROM book WHERE id = 1');
      expect(book).toBeDefined();
      expect((book as any).title).toBe('shs-toan-5-tap-mot');
      expect((book as any).total_pages).toBe(2);

      const pages = await dbService.query('SELECT * FROM book_page WHERE book_id = 1');
      expect(pages.length).toBe(2);
      expect((pages[0] as any).page_number).toBe(1);
      expect((pages[0] as any).image_url).toBe('https://cdn3.olm.vn/book/page1.jpg');

      const driveZip = await dbService.get('SELECT * FROM gg_drive WHERE book_id = 1');
      expect(driveZip).toBeDefined();
      expect((driveZip as any).zip_file_url).toBe('https://drive.google.com/file/d/mock_link/view');
    });

    it('should return failed result for duplicate download attempts', async () => {
      const mockHtml = `
        <html>
          <body>
            <img src="https://cdn3.olm.vn/book/page1.jpg" />
          </body>
        </html>
      `;
      (axios.get as jest.Mock).mockResolvedValue({ data: mockHtml });

      // First request - Success
      await request(app.getHttpServer())
        .post('/api/books/download')
        .send({
          targetUrl: 'https://taphuan.nxbgd.vn/tap-huan/doc-sach/shs-toan-5-tap-mot.123456',
        })
        .expect(200);

      // Second request - Duplicate (Same URL/Title)
      const response = await request(app.getHttpServer())
        .post('/api/books/download')
        .send({
          targetUrl: 'https://taphuan.nxbgd.vn/tap-huan/doc-sach/shs-toan-5-tap-mot.123456',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Success: 0/1');
      expect(response.body.results.failed.length).toBe(1);
      expect(response.body.results.failed[0].error).toContain('already exists in the system (Duplicate)');
    });
  });

  describe('GET /api/books', () => {
    it('should return an empty list initially', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/books')
        .expect(200);

      expect(response.body).toEqual([]);
    });

    it('should retrieve list of all downloaded books', async () => {
      // Seed a book directly into the DB
      await dbService.run(
        'INSERT INTO book (title, description, unsign_title, url, total_pages) VALUES (?, ?, ?, ?, ?)',
        ['book-1', 'Desc', 'book-1', 'http://url-1', 10]
      );

      const response = await request(app.getHttpServer())
        .get('/api/books')
        .expect(200);

      expect(response.body.length).toBe(1);
      expect(response.body[0].title).toBe('book-1');
      expect(response.body[0].total_pages).toBe(10);
    });
  });

  describe('GET /api/books/:id', () => {
    it('should return 404 if book does not exist', async () => {
      await request(app.getHttpServer())
        .get('/api/books/999')
        .expect(404);
    });

    it('should return book details including pages', async () => {
      // Seed a book and page
      await dbService.run(
        'INSERT INTO book (id, title, description, unsign_title, url, total_pages) VALUES (?, ?, ?, ?, ?, ?)',
        [5, 'book-5', 'Desc', 'book-5', 'http://url-5', 1]
      );
      await dbService.run(
        'INSERT INTO book_page (book_id, page_number, image_url, download_url) VALUES (?, ?, ?, ?)',
        [5, 1, 'http://image-5', 'downloads/book_5/001.jpg']
      );

      const response = await request(app.getHttpServer())
        .get('/api/books/5')
        .expect(200);

      expect(response.body.id).toBe(5);
      expect(response.body.title).toBe('book-5');
      expect(response.body.pages.length).toBe(1);
      expect(response.body.pages[0].page_number).toBe(1);
      expect(response.body.pages[0].image_url).toBe('http://image-5');
    });
  });

  describe('DELETE /api/books/:id', () => {
    it('should return 404 if book does not exist', async () => {
      await request(app.getHttpServer())
        .delete('/api/books/999')
        .expect(404);
    });

    it('should soft-delete the book and its records', async () => {
      // Seed
      await dbService.run(
        'INSERT INTO book (id, title, description, unsign_title, url, total_pages) VALUES (?, ?, ?, ?, ?, ?)',
        [8, 'book-8', 'Desc', 'book-8', 'http://url-8', 1]
      );
      await dbService.run(
        'INSERT INTO book_page (book_id, page_number, image_url, download_url) VALUES (?, ?, ?, ?)',
        [8, 1, 'http://image-8', 'downloads/book_8/001.jpg']
      );

      await request(app.getHttpServer())
        .delete('/api/books/8')
        .expect(200);

      // Verify soft-deleted in DB (deleted = 1)
      const book = await dbService.get('SELECT deleted FROM book WHERE id = 8');
      expect((book as any).deleted).toBe(1);

      const page = await dbService.get('SELECT deleted FROM book_page WHERE book_id = 8');
      expect((page as any).deleted).toBe(1);

      // Checking GET /api/books again should not return it
      const listResponse = await request(app.getHttpServer())
        .get('/api/books')
        .expect(200);
      expect(listResponse.body.find((b: any) => b.id === 8)).toBeUndefined();
    });
  });
});
