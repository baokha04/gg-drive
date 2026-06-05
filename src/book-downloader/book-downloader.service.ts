import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { GoogleDriveService } from '../google-drive/google-drive.service';
import { extractTitleFromUrl, removeVietnameseAccents } from '../common/string.utils';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import archiver from 'archiver';
import { IBook, IBookPage, IGgFolder } from '../database/interfaces/database.interfaces';
import { BookListItemDto, BookDetailResponseDto } from './dto/book-list-item.dto';
import { DownloadSuccessItemDto, DownloadFailedItemDto } from './dto/download-response.dto';

@Injectable()
export class BookDownloaderService {
  private readonly logger = new Logger(BookDownloaderService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly googleDriveService: GoogleDriveService,
  ) {}

  async downloadAndStoreBooks(
    targetUrls: string[],
  ): Promise<{ success: DownloadSuccessItemDto[]; failed: DownloadFailedItemDto[] }> {
    const success: DownloadSuccessItemDto[] = [];
    const failed: DownloadFailedItemDto[] = [];
    const googleFolderId = process.env.GOOGLE_FOLDER_ID;

    // Ensure downloads base directory exists
    const downloadsBaseDir = path.resolve(process.cwd(), 'downloads');
    if (!fs.existsSync(downloadsBaseDir)) {
      fs.mkdirSync(downloadsBaseDir, { recursive: true });
    }

    for (const url of targetUrls) {
      try {
        const result = await this.processBook(url, downloadsBaseDir, googleFolderId);
        success.push(result);
      } catch (error) {
        this.logger.error(`Error processing URL: ${url}`, error.stack);
        failed.push({
          url,
          status: 'Failed',
          error: error.message || 'Unknown error',
        });
      }
    }

    return { success, failed };
  }

  private async processBook(
    url: string,
    downloadsBaseDir: string,
    googleFolderId?: string,
  ): Promise<DownloadSuccessItemDto> {
    const title = extractTitleFromUrl(url);
    if (!title) {
      throw new Error('Failed to extract book title from URL.');
    }

    // 1. Check duplicate title in database
    const existingBook = await this.databaseService.get<IBook>(
      'SELECT id FROM book WHERE title = ? AND deleted = 0',
      [title],
    );
    if (existingBook) {
      throw new Error(`Book with title "${title}" already exists in the system (Duplicate).`);
    }

    // 2. Folder resolution
    let ggFolderInternalId: number | null = null;
    if (googleFolderId) {
      const existingFolder = await this.databaseService.get<IGgFolder>(
        'SELECT id FROM gg_folder WHERE folder_id = ? AND deleted = 0',
        [googleFolderId],
      );
      if (existingFolder) {
        ggFolderInternalId = existingFolder.id;
      } else {
        const folderName = await this.googleDriveService.getFolderName(googleFolderId);
        const folderRes = await this.databaseService.run(
          'INSERT INTO gg_folder (folder_id, folder_name) VALUES (?, ?)',
          [googleFolderId, folderName],
        );
        ggFolderInternalId = folderRes.lastID;
      }
    }

    // 3. Scrape image URLs
    this.logger.log(`Fetching HTML from URL: ${url}`);
    let htmlContent = '';
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
        },
        timeout: 15000,
      });
      htmlContent = response.data;
    } catch (err) {
      throw new Error(`Failed to access the book URL: ${err.message}`);
    }

    // Find all links matching https://cdn3.olm.vn*
    // Pattern matches image files like png, jpg, jpeg, webp or without extensions
    const regex = /https:\/\/cdn3\.olm\.vn\/[^\s"']+/g;
    const matches = htmlContent.match(regex) || [];
    // Filter duplicates while preserving order
    const imageUrls = Array.from(new Set(matches));

    if (imageUrls.length === 0) {
      throw new Error('No valid book image links (https://cdn3.olm.vn*) found on the page.');
    }

    this.logger.log(`Found ${imageUrls.length} image URLs for book: ${title}`);

    // 4. Init DB Book Record
    const unsignTitle = removeVietnameseAccents(title);
    const bookRes = await this.databaseService.run(
      'INSERT INTO book (title, description, unsign_title, url, total_pages) VALUES (?, ?, ?, ?, ?)',
      [title, `Book downloaded from ${url}`, unsignTitle, url, imageUrls.length],
    );
    const bookId = bookRes.lastID;

    // 5. Create isolated folder
    const bookDirName = `book_${bookId}`;
    const bookDirPath = path.join(downloadsBaseDir, bookDirName);
    fs.mkdirSync(bookDirPath, { recursive: true });

    const downloadedPages: { pageNumber: number; destPath: string }[] = [];
    const zipPath = path.join(downloadsBaseDir, `${bookDirName}.zip`);

    try {
      // 6. Download images sequentially
      for (let i = 0; i < imageUrls.length; i++) {
        const imageUrl = imageUrls[i];
        const pageNumber = i + 1;
        const pagePadded = String(pageNumber).padStart(3, '0');
        // Extract extension or fallback to jpg
        const urlObj = new URL(imageUrl);
        let ext = path.extname(urlObj.pathname);
        if (!ext || ext.length > 5) {
          ext = '.jpg';
        }
        const fileName = `${pagePadded}${ext}`;
        const destPath = path.join(bookDirPath, fileName);

        this.logger.log(`Downloading page ${pageNumber}/${imageUrls.length}: ${imageUrl}`);
        await this.downloadImageWithRetry(imageUrl, destPath);

        // Store relative path in download_url for DB
        const dbDownloadUrl = path.relative(process.cwd(), destPath).replace(/\\/g, '/');

        // Log page to DB
        await this.databaseService.run(
          'INSERT INTO book_page (book_id, page_number, image_url, download_url) VALUES (?, ?, ?, ?)',
          [bookId, pageNumber, imageUrl, dbDownloadUrl],
        );

        downloadedPages.push({ pageNumber, destPath });
      }

      // 7. Zip book directory
      this.logger.log(`Compressing pages into ZIP: ${zipPath}`);
      await this.zipDirectory(bookDirPath, zipPath);

      // 8. Upload to Google Drive
      const driveFileName = `${title}.zip`;
      this.logger.log(`Uploading ${driveFileName} to Google Drive...`);
      const driveLink = await this.googleDriveService.uploadZip(
        driveFileName,
        zipPath,
        googleFolderId,
      );

      // 9. Store Drive link in DB
      await this.databaseService.run(
        'INSERT INTO gg_drive (book_id, gg_folder_id, zip_file_url) VALUES (?, ?, ?)',
        [bookId, ggFolderInternalId, driveLink],
      );

      // Return details
      return {
        url,
        status: 'Success',
        bookId,
        bookTitle: title,
        totalPages: imageUrls.length,
        googleFolderId: googleFolderId || null,
        driveLink,
      };
    } catch (err) {
      // Cleanup database records for this attempt if book was created but failed mid-way
      // (Optional: In production we could mark it deleted, but here we just throw so the user gets the fail status)
      throw err;
    } finally {
      // 10. Cleanup local folder and ZIP file
      this.logger.log(`Cleaning up temporary folders/files for book ID ${bookId}`);
      if (fs.existsSync(bookDirPath)) {
        fs.rmSync(bookDirPath, { recursive: true, force: true });
      }
      if (fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath);
      }
    }
  }

  private async downloadImageWithRetry(url: string, destPath: string, retries = 3): Promise<void> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      const writer = fs.createWriteStream(destPath);
      try {
        const response = await axios({
          url,
          method: 'GET',
          responseType: 'stream',
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
          },
          timeout: 10000,
        });

        response.data.pipe(writer);

        await new Promise<void>((resolve, reject) => {
          writer.on('finish', resolve);
          writer.on('error', (err) => {
            writer.close();
            reject(err);
          });
        });
        return; // Success
      } catch (error) {
        writer.close();
        if (fs.existsSync(destPath)) {
          fs.unlinkSync(destPath);
        }
        if (attempt === retries) {
          throw new Error(`Failed to download page from ${url} after ${retries} attempts: ${error.message}`);
        }
        this.logger.warn(`Download attempt ${attempt} failed for ${url}. Retrying in 1s...`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  private zipDirectory(sourceDir: string, outPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(outPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => {
        resolve();
      });

      archive.on('error', (err) => {
        reject(err);
      });

      archive.pipe(output);
      archive.directory(sourceDir, false);
      archive.finalize();
    });
  }

  async findAllBooks(): Promise<BookListItemDto[]> {
    return this.databaseService.query<BookListItemDto>(`
      SELECT b.id, b.title, b.description, b.unsign_title, b.url, b.total_pages, b.created_at, b.updated_at,
             d.zip_file_url, f.folder_id as google_folder_id, f.folder_name as google_folder_name
      FROM book b
      LEFT JOIN gg_drive d ON b.id = d.book_id AND d.deleted = 0
      LEFT JOIN gg_folder f ON d.gg_folder_id = f.id AND f.deleted = 0
      WHERE b.deleted = 0
      ORDER BY b.created_at DESC
    `);
  }

  async findBookById(id: number): Promise<BookDetailResponseDto | null> {
    const book = await this.databaseService.get<BookListItemDto>(`
      SELECT b.id, b.title, b.description, b.unsign_title, b.url, b.total_pages, b.created_at, b.updated_at,
             d.zip_file_url, f.folder_id as google_folder_id, f.folder_name as google_folder_name
      FROM book b
      LEFT JOIN gg_drive d ON b.id = d.book_id AND d.deleted = 0
      LEFT JOIN gg_folder f ON d.gg_folder_id = f.id AND f.deleted = 0
      WHERE b.id = ? AND b.deleted = 0
    `, [id]);

    if (!book) {
      return null;
    }

    const pages = await this.databaseService.query<IBookPage>(`
      SELECT id, page_number, image_url, download_url, created_at, updated_at
      FROM book_page
      WHERE book_id = ? AND deleted = 0
      ORDER BY page_number ASC
    `, [id]);

    return {
      ...book,
      pages: pages.map(p => ({
        id: p.id,
        page_number: p.page_number,
        image_url: p.image_url,
        download_url: p.download_url || '',
        created_at: p.created_at,
        updated_at: p.updated_at,
      })),
    };
  }

  async softDeleteBook(id: number): Promise<boolean> {
    const book = await this.databaseService.get<IBook>(
      'SELECT id FROM book WHERE id = ? AND deleted = 0',
      [id],
    );
    if (!book) {
      return false;
    }

    await this.databaseService.run(
      'UPDATE book SET deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [id],
    );
    await this.databaseService.run(
      'UPDATE book_page SET deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE book_id = ?',
      [id],
    );
    await this.databaseService.run(
      'UPDATE gg_drive SET deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE book_id = ?',
      [id],
    );

    return true;
  }
}
