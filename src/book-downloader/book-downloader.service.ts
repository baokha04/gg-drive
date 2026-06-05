import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { GoogleDriveService } from '../google-drive/google-drive.service';
import { extractTitleFromUrl, removeVietnameseAccents } from '../common/string.utils';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import archiver from 'archiver';

@Injectable()
export class BookDownloaderService {
  private readonly logger = new Logger(BookDownloaderService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly googleDriveService: GoogleDriveService,
  ) {}

  async downloadAndStoreBooks(
    targetUrls: string[],
    googleFolderId?: string,
  ): Promise<{ success: any[]; failed: any[] }> {
    const success: any[] = [];
    const failed: any[] = [];

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
          status: 'Thất bại',
          error: error.message || 'Lỗi không xác định',
        });
      }
    }

    return { success, failed };
  }

  private async processBook(
    url: string,
    downloadsBaseDir: string,
    googleFolderId?: string,
  ): Promise<any> {
    const title = extractTitleFromUrl(url);
    if (!title) {
      throw new Error('Không thể trích xuất tiêu đề sách từ đường dẫn (URL).');
    }

    // 1. Check duplicate title in database
    const existingBook = await this.databaseService.get<any>(
      'SELECT id FROM book WHERE title = ? AND deleted = 0',
      [title],
    );
    if (existingBook) {
      throw new Error(`Sách với title "${title}" đã tồn tại trong hệ thống (Trùng lặp).`);
    }

    // 2. Folder resolution
    let ggFolderInternalId: number | null = null;
    if (googleFolderId) {
      const existingFolder = await this.databaseService.get<any>(
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
      throw new Error(`Không thể truy cập đường dẫn sách: ${err.message}`);
    }

    // Find all links matching https://cdn3.olm.vn*
    // Pattern matches image files like png, jpg, jpeg, webp or without extensions
    const regex = /https:\/\/cdn3\.olm\.vn\/[^\s"']+/g;
    const matches = htmlContent.match(regex) || [];
    // Filter duplicates while preserving order
    const imageUrls = Array.from(new Set(matches));

    if (imageUrls.length === 0) {
      throw new Error('Không tìm thấy link ảnh sách hợp lệ (https://cdn3.olm.vn*) trong trang web.');
    }

    this.logger.log(`Found ${imageUrls.length} image URLs for book: ${title}`);

    // 4. Init DB Book Record
    const unsignTitle = removeVietnameseAccents(title);
    const bookRes = await this.databaseService.run(
      'INSERT INTO book (title, description, unsign_title, url, total_pages) VALUES (?, ?, ?, ?, ?)',
      [title, `Sách tải từ ${url}`, unsignTitle, url, imageUrls.length],
    );
    const bookId = bookRes.lastID;

    // 5. Create isolated folder
    const bookDirName = `book_${bookId}`;
    const bookDirPath = path.join(downloadsBaseDir, bookDirName);
    fs.mkdirSync(bookDirPath, { recursive: true });

    const downloadedPages: any[] = [];
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
        status: 'Thành công',
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
}
