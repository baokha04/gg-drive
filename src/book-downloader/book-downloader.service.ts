import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
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
import { extractTitleFromUrl } from '../common/string.utils';
import * as fs from 'fs';
import * as path from 'path';
import { BookScraperService } from './services/book-scraper.service';
import { PageDownloaderService } from './services/page-downloader.service';
import { ArchiveService } from './services/archive.service';
import { BookResolverService } from './services/book-resolver.service';

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

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly bookScraper: BookScraperService,
    private readonly pageDownloader: PageDownloaderService,
    private readonly archiveService: ArchiveService,
    private readonly bookResolver: BookResolverService,
  ) {}

  async downloadAndStoreBooks(
    targetUrls: string[],
  ): Promise<QueuedJobItemDto[]> {
    const queuedJobs: QueuedJobItemDto[] = [];

    for (const url of targetUrls) {
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

    this.startWorker();

    return queuedJobs;
  }

  async downloadPendingFromCatalog(): Promise<QueuedJobItemDto[]> {
    const pendingRows = await this.databaseService.query<{ url: string }>(
      "SELECT url FROM catalog_detail WHERE status = 'pending'",
    );

    if (pendingRows.length === 0) {
      return [];
    }

    const urls = pendingRows.map((r) => r.url);

    for (const url of urls) {
      await this.databaseService.run(
        "UPDATE catalog_detail SET status = 'processing', updated_at = CURRENT_TIMESTAMP WHERE url = ?",
        [url],
      );
    }

    return this.downloadAndStoreBooks(urls);
  }

  getStepsList(): StepsListDto {
    return { steps: [...this.STEP_PIPELINE] };
  }

  async findJobById(id: number): Promise<DownloadJobDto | null> {
    const job = await this.databaseService.get<IDownloadJob>(
      'SELECT id, url, status, total_pages, current_page, book_id, error_message, current_step, created_at, updated_at FROM download_job WHERE id = ?',
      [id],
    );
    if (!job) {
      return null;
    }
    return this.toJobDto(job);
  }

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
    return jobs.map((j) => this.toJobDto(j));
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

    await this.databaseService.run(
      'UPDATE download_job SET status = ?, error_message = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['pending', id],
    );

    this.logger.log(`Job ${id} reset to pending for retry.`);

    this.startWorker();

    return this.findJobById(id);
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
      await this.databaseService.run(
        "UPDATE catalog_detail SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE url = ?",
        [job.url],
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
      await this.databaseService.run(
        "UPDATE catalog_detail SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE url = ?",
        [job.url],
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
    const htmlContent = await this.bookScraper.fetchHtml(ctx.url);
    ctx.imageUrls = this.bookScraper.extractImageUrls(htmlContent);

    if (ctx.imageUrls.length === 0) {
      throw new Error(
        'No valid book image links (https://cdn3.olm.vn*) found on the page.',
      );
    }
    this.logger.log(
      `[Job ${ctx.jobId}] Re-scraped ${ctx.imageUrls.length} image URLs to rebuild context.`,
    );
  }

  private async stepResolveBook(ctx: StepContext): Promise<void> {
    const existingByUrl = await this.bookResolver.findByUrl(ctx.url);
    const existingByTitle = !existingByUrl
      ? await this.bookResolver.findByTitle(ctx.title)
      : null;
    const existing = existingByUrl || existingByTitle;

    if (existing) {
      ctx.bookId = existing.id;
      ctx.isResuming = true;
      ctx.bookDirPath = path.join(ctx.downloadsBaseDir, `book_${ctx.bookId}`);
      ctx.zipPath = path.join(ctx.downloadsBaseDir, `book_${ctx.bookId}.zip`);

      await this.databaseService.run(
        'UPDATE download_job SET book_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [ctx.bookId, ctx.jobId],
      );
      this.logger.log(
        `Book already exists (ID: ${ctx.bookId}). Resuming from existing record.`,
      );
    } else {
      ctx.bookId = 0;
      ctx.isResuming = false;
    }
  }

  private async stepScrapePages(ctx: StepContext): Promise<void> {
    await this.ensureImageUrls(ctx);

    await this.databaseService.run(
      'UPDATE download_job SET total_pages = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [ctx.imageUrls.length, ctx.jobId],
    );
  }

  private async stepInitBookRecord(ctx: StepContext): Promise<void> {
    await this.ensureImageUrls(ctx);

    if (!ctx.isResuming && ctx.bookId === 0) {
      ctx.bookId = await this.bookResolver.createBook({
        title: ctx.title,
        url: ctx.url,
        totalPages: ctx.imageUrls.length,
      });
      ctx.bookDirPath = path.join(ctx.downloadsBaseDir, `book_${ctx.bookId}`);
      ctx.zipPath = path.join(ctx.downloadsBaseDir, `book_${ctx.bookId}.zip`);

      await this.databaseService.run(
        'UPDATE download_job SET book_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [ctx.bookId, ctx.jobId],
      );
      this.logger.log(`Created new book record with ID: ${ctx.bookId}`);
      return;
    }

    if (ctx.bookId === 0) {
      const existing = await this.bookResolver.findByUrl(ctx.url);
      if (existing) {
        ctx.bookId = existing.id;
        ctx.isResuming = true;
        await this.databaseService.run(
          'UPDATE download_job SET book_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [ctx.bookId, ctx.jobId],
        );
      } else {
        ctx.isResuming = false;
        await this.stepInitBookRecord(ctx);
        return;
      }
    }

    ctx.bookDirPath = path.join(ctx.downloadsBaseDir, `book_${ctx.bookId}`);
    ctx.zipPath = path.join(ctx.downloadsBaseDir, `book_${ctx.bookId}.zip`);

    await this.bookResolver.updateTotalPages(ctx.bookId, ctx.imageUrls.length);
    this.logger.log(`Reusing existing book record with ID: ${ctx.bookId}`);
  }

  private async stepDownloadPages(ctx: StepContext): Promise<void> {
    if (ctx.bookId === 0) {
      throw new Error('Cannot download pages: bookId is not initialized.');
    }
    await this.ensureImageUrls(ctx);

    ctx.bookDirPath = path.join(ctx.downloadsBaseDir, `book_${ctx.bookId}`);
    fs.mkdirSync(ctx.bookDirPath, { recursive: true });

    const downloadedPageNumbers =
      await this.bookResolver.getDownloadedPageNumbers(ctx.bookId);
    if (downloadedPageNumbers.size > 0) {
      this.logger.log(
        `Found ${downloadedPageNumbers.size} already downloaded pages. Will skip those.`,
      );
    }

    for (let i = 0; i < ctx.imageUrls.length; i++) {
      const imageUrl = ctx.imageUrls[i];
      const pageNumber = i + 1;

      if (downloadedPageNumbers.has(pageNumber)) {
        this.logger.log(
          `Page ${pageNumber}/${ctx.imageUrls.length} already downloaded. Skipping.`,
        );
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
      await this.pageDownloader.downloadImageWithRetry(imageUrl, destPath);

      const dbDownloadUrl = path
        .relative(process.cwd(), destPath)
        .replace(/\\/g, '/');

      await this.bookResolver.recordPage(
        ctx.bookId,
        pageNumber,
        imageUrl,
        dbDownloadUrl,
      );

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
    await this.archiveService.zipDirectory(ctx.bookDirPath, ctx.zipPath);
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

  private toJobDto(job: IDownloadJob): DownloadJobDto {
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
}
