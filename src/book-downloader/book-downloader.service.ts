import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  extractTitleFromUrl,
  removeVietnameseAccents,
} from '../common/string.utils';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import archiver from 'archiver';
import {
  IBook,
  IBookPage,
  IDownloadJob,
  JobStep,
} from '../database/interfaces/database.interfaces';
import {
  BookListItemDto,
  BookDetailResponseDto,
} from './dto/book-list-item.dto';
import {
  QueuedJobItemDto,
  DownloadJobDto,
  StepsListDto,
} from './dto/download-job.dto';

interface StepContext {
  jobId: number;
  url: string;
  downloadsBaseDir: string;
  title: string;
  bookId: number;
  isResuming: boolean;
  imageUrls: string[];
  bookDirPath: string;
  zipPath: string;
}

@Injectable()
export class BookDownloaderService {
  private readonly logger = new Logger(BookDownloaderService.name);
  private isWorkerRunning = false;

  readonly STEP_PIPELINE: JobStep[] = [
    'RESOLVE_BOOK',
    'SCRAPE_PAGES',
    'INIT_BOOK_RECORD',
    'DOWNLOAD_PAGES',
    'ZIP_DIRECTORY',
  ];

  constructor(private readonly databaseService: DatabaseService) {}

  async downloadAndStoreBooks(
    targetUrls: string[],
  ): Promise<QueuedJobItemDto[]> {
    const queuedJobs: QueuedJobItemDto[] = [];

    for (const url of targetUrls) {
      // Check if an active job (pending/processing) already exists for this URL
      const existingJob = await this.databaseService.get<IDownloadJob>(
        'SELECT id, url, status FROM download_job WHERE url = ? AND status IN (?, ?) ORDER BY id DESC LIMIT 1',
        [url, 'pending', 'processing'],
      );

      if (existingJob) {
        this.logger.warn(
          `Job already exists for URL: ${url} (job ID: ${existingJob.id}, status: ${existingJob.status}). Skipping duplicate.`,
        );
        queuedJobs.push({
          id: existingJob.id,
          url: existingJob.url,
          status: existingJob.status,
        });
        continue;
      }

      const res = await this.databaseService.run(
        'INSERT INTO download_job (url, status) VALUES (?, ?)',
        [url, 'pending'],
      );
      queuedJobs.push({
        id: res.lastID,
        url,
        status: 'pending',
      });
    }

    // Trigger worker asynchronously
    this.startWorker();

    return queuedJobs;
  }

  private async startWorker() {
    if (this.isWorkerRunning) {
      return;
    }
    this.isWorkerRunning = true;

    this.runWorker().catch((err) => {
      this.logger.error('Background worker crashed unexpectedly', err.stack);
      this.isWorkerRunning = false;
    });
  }

  private async runWorker() {
    const downloadsBaseDir = path.resolve(process.cwd(), 'downloads');
    if (!fs.existsSync(downloadsBaseDir)) {
      fs.mkdirSync(downloadsBaseDir, { recursive: true });
    }

    while (true) {
      const nextJob = await this.databaseService.get<IDownloadJob>(
        'SELECT * FROM download_job WHERE status = ? ORDER BY id ASC LIMIT 1',
        ['pending'],
      );

      if (!nextJob) {
        break;
      }

      await this.executeJob(nextJob, downloadsBaseDir);
    }

    this.isWorkerRunning = false;
  }

  private async executeJob(job: IDownloadJob, downloadsBaseDir: string) {
    const startStep = job.current_step || 'RESOLVE_BOOK';
    this.logger.log(
      `Processing job ${job.id} for URL: ${job.url}. Starting from step: ${startStep}`,
    );

    await this.databaseService.run(
      'UPDATE download_job SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['processing', job.id],
    );

    try {
      const bookId = await this.processBookWithProgress(
        job.id,
        job.url,
        downloadsBaseDir,
        startStep,
      );

      await this.databaseService.run(
        'UPDATE download_job SET status = ?, book_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['completed', bookId, job.id],
      );
      this.logger.log(
        `Job ${job.id} completed successfully. Linked book ID: ${bookId}`,
      );
    } catch (error) {
      this.logger.error(
        `Job ${job.id} failed at step ${job.current_step || 'RESOLVE_BOOK'}: ${error.message}`,
        error.stack,
      );

      await this.databaseService.run(
        'UPDATE download_job SET status = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['failed', error.message || 'Unknown error', job.id],
      );
    }
  }

  private async processBookWithProgress(
    jobId: number,
    url: string,
    downloadsBaseDir: string,
    currentStep: JobStep = 'RESOLVE_BOOK',
  ): Promise<number> {
    const title = extractTitleFromUrl(url);
    if (!title) {
      throw new Error('Failed to extract book title from URL.');
    }

    // Load existing job to check for previously assigned book_id
    const job = await this.databaseService.get<IDownloadJob>(
      'SELECT book_id FROM download_job WHERE id = ?',
      [jobId],
    );

    const ctx: StepContext = {
      jobId,
      url,
      downloadsBaseDir,
      title,
      bookId: job?.book_id || 0,
      isResuming: job?.book_id && job.book_id > 0 ? true : false,
      imageUrls: [],
      bookDirPath: '',
      zipPath: '',
    };

    if (ctx.bookId > 0) {
      ctx.bookDirPath = path.join(downloadsBaseDir, `book_${ctx.bookId}`);
      ctx.zipPath = path.join(downloadsBaseDir, `book_${ctx.bookId}.zip`);
    }

    const startStepIndex = this.STEP_PIPELINE.indexOf(currentStep);
    if (startStepIndex === -1) {
      throw new Error(`Invalid step specified: ${currentStep}`);
    }

    for (let i = startStepIndex; i < this.STEP_PIPELINE.length; i++) {
      const step = this.STEP_PIPELINE[i];
      await this.updateJobStep(jobId, step);
      this.logger.log(`[Job ${jobId}] Running step: ${step}`);
      await this.executeStep(step, ctx);
    }

    await this.updateJobStep(jobId, 'COMPLETED');
    return ctx.bookId;
  }

  private async executeStep(step: JobStep, ctx: StepContext): Promise<void> {
    switch (step) {
      case 'RESOLVE_BOOK':
        await this.stepResolveBook(ctx);
        break;
      case 'SCRAPE_PAGES':
        await this.stepScrapePages(ctx);
        break;
      case 'INIT_BOOK_RECORD':
        await this.stepInitBookRecord(ctx);
        break;
      case 'DOWNLOAD_PAGES':
        await this.stepDownloadPages(ctx);
        break;
      case 'ZIP_DIRECTORY':
        await this.stepZipDirectory(ctx);
        break;
      default:
        throw new Error(`Execution not defined for step: ${step}`);
    }
  }

  private async updateJobStep(jobId: number, step: JobStep): Promise<void> {
    await this.databaseService.run(
      'UPDATE download_job SET current_step = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [step, jobId],
    );
  }

  private async ensureImageUrls(ctx: StepContext): Promise<void> {
    if (ctx.imageUrls && ctx.imageUrls.length > 0) {
      return;
    }
    const htmlContent = await this.fetchHtml(ctx.url);
    const regex = /https:\/\/cdn3\.olm\.vn\/[^\s"']+/g;
    const matches = htmlContent.match(regex) || [];
    ctx.imageUrls = Array.from(new Set(matches));

    if (ctx.imageUrls.length === 0) {
      throw new Error(
        'No valid book image links (https://cdn3.olm.vn*) found on the page.',
      );
    }
    this.logger.log(
      `[Job ${ctx.jobId}] Re-scraped ${ctx.imageUrls.length} image URLs to rebuild context.`,
    );
  }

  private async fetchHtml(url: string): Promise<string> {
    this.logger.log(`Fetching HTML from URL: ${url}`);
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
        },
        timeout: 15000,
      });
      return response.data;
    } catch (err) {
      throw new Error(`Failed to access the book URL: ${err.message}`);
    }
  }

  private async stepResolveBook(ctx: StepContext): Promise<void> {
    const existingBookByUrl = await this.databaseService.get<IBook>(
      'SELECT * FROM book WHERE url = ? AND deleted = 0',
      [ctx.url],
    );
    const existingBookByTitle = !existingBookByUrl
      ? await this.databaseService.get<IBook>(
          'SELECT * FROM book WHERE title = ? AND deleted = 0',
          [ctx.title],
        )
      : null;

    if (existingBookByUrl) {
      ctx.bookId = existingBookByUrl.id;
      ctx.isResuming = true;
      ctx.bookDirPath = path.join(ctx.downloadsBaseDir, `book_${ctx.bookId}`);
      ctx.zipPath = path.join(ctx.downloadsBaseDir, `book_${ctx.bookId}.zip`);

      await this.databaseService.run(
        'UPDATE download_job SET book_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [ctx.bookId, ctx.jobId],
      );
      this.logger.log(
        `Book already exists for URL (ID: ${ctx.bookId}). Resuming from existing record.`,
      );
    } else if (existingBookByTitle) {
      ctx.bookId = existingBookByTitle.id;
      ctx.isResuming = true;
      ctx.bookDirPath = path.join(ctx.downloadsBaseDir, `book_${ctx.bookId}`);
      ctx.zipPath = path.join(ctx.downloadsBaseDir, `book_${ctx.bookId}.zip`);

      await this.databaseService.run(
        'UPDATE download_job SET book_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [ctx.bookId, ctx.jobId],
      );
      this.logger.log(
        `Book already exists with title "${ctx.title}" (ID: ${ctx.bookId}). Resuming from existing record.`,
      );
    } else {
      ctx.bookId = 0;
      ctx.isResuming = false;
    }
  }

  private async stepScrapePages(ctx: StepContext): Promise<void> {
    await this.ensureImageUrls(ctx);

    // Update job total pages
    await this.databaseService.run(
      'UPDATE download_job SET total_pages = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [ctx.imageUrls.length, ctx.jobId],
    );
  }

  private async stepInitBookRecord(ctx: StepContext): Promise<void> {
    await this.ensureImageUrls(ctx);

    if (!ctx.isResuming && ctx.bookId === 0) {
      const unsignTitle = removeVietnameseAccents(ctx.title);
      const bookRes = await this.databaseService.run(
        'INSERT INTO book (title, description, unsign_title, url, total_pages) VALUES (?, ?, ?, ?, ?)',
        [
          ctx.title,
          `Book downloaded from ${ctx.url}`,
          unsignTitle,
          ctx.url,
          ctx.imageUrls.length,
        ],
      );
      ctx.bookId = bookRes.lastID;
      ctx.bookDirPath = path.join(ctx.downloadsBaseDir, `book_${ctx.bookId}`);
      ctx.zipPath = path.join(ctx.downloadsBaseDir, `book_${ctx.bookId}.zip`);

      await this.databaseService.run(
        'UPDATE download_job SET book_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [ctx.bookId, ctx.jobId],
      );
      this.logger.log(`Created new book record with ID: ${ctx.bookId}`);
    } else {
      // Rebuild paths and update total pages for existing book record
      if (ctx.bookId === 0) {
        const existingBook = await this.databaseService.get<IBook>(
          'SELECT id FROM book WHERE url = ? AND deleted = 0',
          [ctx.url],
        );
        if (existingBook) {
          ctx.bookId = existingBook.id;
          ctx.isResuming = true;
          await this.databaseService.run(
            'UPDATE download_job SET book_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [ctx.bookId, ctx.jobId],
          );
        } else {
          // Force creation if fallback fails
          ctx.isResuming = false;
          await this.stepInitBookRecord(ctx);
          return;
        }
      }

      ctx.bookDirPath = path.join(ctx.downloadsBaseDir, `book_${ctx.bookId}`);
      ctx.zipPath = path.join(ctx.downloadsBaseDir, `book_${ctx.bookId}.zip`);

      await this.databaseService.run(
        'UPDATE book SET total_pages = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [ctx.imageUrls.length, ctx.bookId],
      );
      this.logger.log(`Reusing existing book record with ID: ${ctx.bookId}`);
    }
  }

  private async stepDownloadPages(ctx: StepContext): Promise<void> {
    if (ctx.bookId === 0) {
      throw new Error('Cannot download pages: bookId is not initialized.');
    }
    await this.ensureImageUrls(ctx);

    ctx.bookDirPath = path.join(ctx.downloadsBaseDir, `book_${ctx.bookId}`);
    fs.mkdirSync(ctx.bookDirPath, { recursive: true });

    // Get already downloaded pages for resume support
    const existingPages = await this.databaseService.query<IBookPage>(
      'SELECT page_number FROM book_page WHERE book_id = ? AND deleted = 0',
      [ctx.bookId],
    );
    const downloadedPageNumbers = new Set(
      existingPages.map((p) => p.page_number),
    );
    if (downloadedPageNumbers.size > 0) {
      this.logger.log(
        `Found ${downloadedPageNumbers.size} already downloaded pages. Will skip those.`,
      );
    }

    // Download images sequentially (skip already downloaded)
    for (let i = 0; i < ctx.imageUrls.length; i++) {
      const imageUrl = ctx.imageUrls[i];
      const pageNumber = i + 1;

      // Skip already downloaded pages
      if (downloadedPageNumbers.has(pageNumber)) {
        this.logger.log(
          `Page ${pageNumber}/${ctx.imageUrls.length} already downloaded. Skipping.`,
        );
        // Sync progress in DB if it was lost/lower
        await this.databaseService.run(
          'UPDATE download_job SET current_page = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND current_page < ?',
          [pageNumber, ctx.jobId, pageNumber],
        );
        continue;
      }

      const pagePadded = String(pageNumber).padStart(3, '0');
      const urlObj = new URL(imageUrl);
      let ext = path.extname(urlObj.pathname);
      if (!ext || ext.length > 5) {
        ext = '.jpg';
      }
      const fileName = `${pagePadded}${ext}`;
      const destPath = path.join(ctx.bookDirPath, fileName);

      this.logger.log(
        `Downloading page ${pageNumber}/${ctx.imageUrls.length}: ${imageUrl}`,
      );
      await this.downloadImageWithRetry(imageUrl, destPath);

      const dbDownloadUrl = path
        .relative(process.cwd(), destPath)
        .replace(/\\/g, '/');

      // Log page to DB
      await this.databaseService.run(
        'INSERT INTO book_page (book_id, page_number, image_url, download_url) VALUES (?, ?, ?, ?)',
        [ctx.bookId, pageNumber, imageUrl, dbDownloadUrl],
      );

      // Update job current page progress
      await this.databaseService.run(
        'UPDATE download_job SET current_page = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [pageNumber, ctx.jobId],
      );
    }
  }

  private async stepZipDirectory(ctx: StepContext): Promise<void> {
    if (ctx.bookId === 0) {
      throw new Error('Cannot zip directory: bookId is not initialized.');
    }
    ctx.bookDirPath = path.join(ctx.downloadsBaseDir, `book_${ctx.bookId}`);
    ctx.zipPath = path.join(ctx.downloadsBaseDir, `book_${ctx.bookId}.zip`);

    this.logger.log(`Compressing pages into ZIP: ${ctx.zipPath}`);
    await this.zipDirectory(ctx.bookDirPath, ctx.zipPath);
  }

  private async downloadImageWithRetry(
    url: string,
    destPath: string,
    retries = 3,
  ): Promise<void> {
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
          throw new Error(
            `Failed to download page from ${url} after ${retries} attempts: ${error.message}`,
          );
        }
        this.logger.warn(
          `Download attempt ${attempt} failed for ${url}. Retrying in 1s...`,
        );
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

  getStepsList(): StepsListDto {
    return { steps: [...this.STEP_PIPELINE] };
  }

  private async cleanupForStep(
    job: IDownloadJob,
    fromStep: JobStep,
  ): Promise<void> {
    const startIndex = this.STEP_PIPELINE.indexOf(fromStep);
    if (startIndex === -1) return;

    const bookId = job.book_id;
    if (!bookId) return;

    for (let i = startIndex; i < this.STEP_PIPELINE.length; i++) {
      const step = this.STEP_PIPELINE[i];

      switch (step) {
        case 'DOWNLOAD_PAGES':
          await this.databaseService.run(
            'DELETE FROM book_page WHERE book_id = ?',
            [bookId],
          );
          const dirPath = path.join(
            process.cwd(),
            'downloads',
            `book_${bookId}`,
          );
          if (fs.existsSync(dirPath)) {
            fs.rmSync(dirPath, { recursive: true, force: true });
            this.logger.log(`Cleaned up download directory: ${dirPath}`);
          }
          break;

        case 'ZIP_DIRECTORY':
          const zipPath = path.join(
            process.cwd(),
            'downloads',
            `book_${bookId}.zip`,
          );
          if (fs.existsSync(zipPath)) {
            fs.unlinkSync(zipPath);
            this.logger.log(`Cleaned up ZIP file: ${zipPath}`);
          }
          break;
      }
    }
  }

  async retryJobStep(
    id: number,
    step: JobStep,
  ): Promise<DownloadJobDto | null> {
    const job = await this.databaseService.get<IDownloadJob>(
      'SELECT * FROM download_job WHERE id = ?',
      [id],
    );

    if (!job) return null;

    if (job.status !== 'failed') {
      throw new Error(
        `Job ${id} cannot be retried — current status is '${job.status}'. Only 'failed' jobs can be retried.`,
      );
    }

    if (!this.STEP_PIPELINE.includes(step)) {
      throw new Error(
        `Invalid step '${step}'. Valid steps: ${this.STEP_PIPELINE.join(', ')}`,
      );
    }

    await this.cleanupForStep(job, step);

    await this.databaseService.run(
      'UPDATE download_job SET status = ?, current_step = ?, error_message = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['pending', step, id],
    );

    this.logger.log(
      `Job ${id} reset to pending for retry from step '${step}'.`,
    );
    this.startWorker();

    return this.findJobById(id);
  }

  async findJobById(id: number): Promise<DownloadJobDto | null> {
    const job = await this.databaseService.get<IDownloadJob>(
      'SELECT id, url, status, total_pages, current_page, book_id, error_message, current_step, created_at, updated_at FROM download_job WHERE id = ?',
      [id],
    );
    if (!job) {
      return null;
    }
    return {
      id: job.id,
      url: job.url,
      status: job.status,
      total_pages: job.total_pages,
      current_page: job.current_page,
      book_id: job.book_id,
      error_message: job.error_message || null,
      current_step: job.current_step,
      created_at: job.created_at,
      updated_at: job.updated_at,
    };
  }

  async findAllBooks(): Promise<BookListItemDto[]> {
    return this.databaseService.query<BookListItemDto>(`
      SELECT b.id, b.title, b.description, b.unsign_title, b.url, b.total_pages, b.created_at, b.updated_at
      FROM book b
      WHERE b.deleted = 0
      ORDER BY b.created_at DESC
    `);
  }

  async findBookById(id: number): Promise<BookDetailResponseDto | null> {
    const book = await this.databaseService.get<BookListItemDto>(
      `
      SELECT b.id, b.title, b.description, b.unsign_title, b.url, b.total_pages, b.created_at, b.updated_at
      FROM book b
      WHERE b.id = ? AND b.deleted = 0
    `,
      [id],
    );

    if (!book) {
      return null;
    }

    const pages = await this.databaseService.query<IBookPage>(
      `
      SELECT id, page_number, image_url, download_url, created_at, updated_at
      FROM book_page
      WHERE book_id = ? AND deleted = 0
      ORDER BY page_number ASC
    `,
      [id],
    );

    return {
      ...book,
      pages: pages.map((p) => ({
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

    return true;
  }

  /**
   * Retry a failed job — resets status to 'pending' and re-triggers the background worker.
   * Only jobs with status 'failed' can be retried.
   */
  async retryJob(id: number): Promise<DownloadJobDto | null> {
    const job = await this.databaseService.get<IDownloadJob>(
      'SELECT * FROM download_job WHERE id = ?',
      [id],
    );

    if (!job) {
      return null;
    }

    if (job.status !== 'failed') {
      throw new Error(
        `Job ${id} cannot be retried — current status is '${job.status}'. Only 'failed' jobs can be retried.`,
      );
    }

    // Reset job state for retry - keep current_page, total_pages, and current_step
    await this.databaseService.run(
      'UPDATE download_job SET status = ?, error_message = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['pending', id],
    );

    this.logger.log(`Job ${id} reset to pending for retry.`);

    // Re-trigger worker
    this.startWorker();

    // Return updated job info
    return this.findJobById(id);
  }

  /**
   * Get all download jobs, optionally filtered by status.
   */
  async findAllJobs(status?: string): Promise<DownloadJobDto[]> {
    let sql =
      'SELECT id, url, status, total_pages, current_page, book_id, error_message, current_step, created_at, updated_at FROM download_job';
    const params: any[] = [];

    if (status) {
      sql += ' WHERE status = ?';
      params.push(status);
    }

    sql += ' ORDER BY id DESC';

    const jobs = await this.databaseService.query<IDownloadJob>(sql, params);
    return jobs.map((job) => ({
      id: job.id,
      url: job.url,
      status: job.status,
      total_pages: job.total_pages,
      current_page: job.current_page,
      book_id: job.book_id,
      error_message: job.error_message || null,
      current_step: job.current_step,
      created_at: job.created_at,
      updated_at: job.updated_at,
    }));
  }
}
