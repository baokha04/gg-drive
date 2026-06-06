import { Injectable, Logger } from '@nestjs/common';
import { BookScraperService } from '../../book-downloader/services/book-scraper.service';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class CatalogScraperService {
  private readonly logger = new Logger(CatalogScraperService.name);

  constructor(
    private readonly bookScraper: BookScraperService,
    private readonly databaseService: DatabaseService,
  ) {}

  async scrapeCatalogAndPersist(
    catalogUrl: string,
    crawlAllPages = false,
  ): Promise<{
    crawledPages: number;
    foundBooks: number;
    persistedPendingBooks: number;
  }> {
    this.logger.log(`Scraping catalog and persisting: ${catalogUrl}`);

    let grade = 0;
    let publisherId = 0;
    try {
      const urlObj = new URL(catalogUrl);
      const gradeParam = urlObj.searchParams.get('grade');
      const idBookParam = urlObj.searchParams.get('id_book');
      if (gradeParam) grade = parseInt(gradeParam, 10);
      if (idBookParam) publisherId = parseInt(idBookParam, 10);
    } catch (err) {
      this.logger.warn(`Failed to parse URL query params: ${err.message}`);
    }

    if (!grade || !publisherId) {
      throw new Error(
        'Catalog URL must contain grade and id_book query parameters.',
      );
    }

    const absCatalogUrl = this.toAbsoluteUrl(catalogUrl);
    const pagesToScrape = new Set<string>();
    pagesToScrape.add(absCatalogUrl);

    let initialHtml = '';
    try {
      initialHtml = await this.bookScraper.fetchHtml(absCatalogUrl);
    } catch (err) {
      this.logger.error(`Failed to fetch initial catalog page: ${err.message}`);
      throw err;
    }

    if (crawlAllPages) {
      try {
        const paginationLinks = this.extractPaginationLinks(initialHtml);
        for (const link of paginationLinks) {
          pagesToScrape.add(link);
        }
      } catch (err) {
        this.logger.warn(`Failed to parse pagination links: ${err.message}`);
      }
    }

    const targetPages = Array.from(pagesToScrape).slice(0, 10);
    this.logger.log(`Will scrape ${targetPages.length} catalog pages`);

    const publisherName = this.extractPublisherName(initialHtml, publisherId);

    const gradeDbId = await this.getOrCreateGrade(grade);
    const publisherDbId = await this.getOrCreatePublisher(
      publisherId,
      publisherName,
    );

    const detailUrls = new Set<string>();

    for (const pageUrl of targetPages) {
      try {
        let html: string;
        if (pageUrl === absCatalogUrl) {
          html = initialHtml;
        } else {
          html = await this.bookScraper.fetchHtml(pageUrl);
        }
        const extractedDetails = this.extractDetailLinks(html);
        this.logger.log(
          `Found ${extractedDetails.length} book details on ${pageUrl}`,
        );
        for (const detailUrl of extractedDetails) {
          detailUrls.add(detailUrl);
        }
      } catch (err) {
        this.logger.warn(
          `Failed to scrape catalog page ${pageUrl}: ${err.message}`,
        );
      }
    }

    this.logger.log(
      `Found ${detailUrls.size} unique book details. Extracting reading URLs...`,
    );

    let persistedCount = 0;
    let foundCount = 0;

    for (const detailUrl of detailUrls) {
      try {
        const html = await this.bookScraper.fetchHtml(detailUrl);
        const extractedReaders = this.extractReadingLinks(html);
        this.logger.log(
          `Found ${extractedReaders.length} reading URLs on ${detailUrl}`,
        );

        for (const readerUrl of extractedReaders) {
          foundCount++;
          const readingTitle = this.extractReadingTitle(html, readerUrl);

          const isInserted = await this.persistCatalogDetail(
            gradeDbId,
            publisherDbId,
            readingTitle,
            readerUrl,
          );
          if (isInserted) {
            persistedCount++;
          }
        }
      } catch (err) {
        this.logger.warn(
          `Failed to scrape book detail ${detailUrl}: ${err.message}`,
        );
      }
    }

    return {
      crawledPages: targetPages.length,
      foundBooks: foundCount,
      persistedPendingBooks: persistedCount,
    };
  }

  private toAbsoluteUrl(url: string): string {
    if (url.startsWith('/')) {
      return `https://taphuan.nxbgd.vn${url}`;
    }
    return url;
  }

  private extractPaginationLinks(html: string): string[] {
    const regex =
      /(?:https:\/\/taphuan\.nxbgd\.vn)?\/tap-huan\/cac-bo-sach-khac(?:\/page-\d+)?(?:\?[^"'\s<>\)]+)?/g;
    const matches = html.match(regex) || [];
    return Array.from(new Set(matches.map((url) => this.toAbsoluteUrl(url))));
  }

  private extractDetailLinks(html: string): string[] {
    const regex =
      /(?:https:\/\/taphuan\.nxbgd\.vn)?\/tap-huan\/chi-tiet-sach\/[^"'\s<>\)]+/g;
    const matches = html.match(regex) || [];
    return Array.from(new Set(matches.map((url) => this.toAbsoluteUrl(url))));
  }

  private extractReadingLinks(html: string): string[] {
    const regex =
      /(?:https:\/\/taphuan\.nxbgd\.vn)?\/tap-huan\/doc-sach\/[^"'\s<>\)]+/g;
    const matches = html.match(regex) || [];
    return Array.from(new Set(matches.map((url) => this.toAbsoluteUrl(url))));
  }

  private extractPublisherName(html: string, publisherId: number): string {
    const regex = new RegExp(
      `\\[([^\\]]+)\\]\\([^\\)]+id_book=${publisherId}[^\\)]*\\)`,
      'i',
    );
    const match = html.match(regex);
    if (match) {
      return match[1].trim();
    }
    const htmlRegex = new RegExp(
      `<a[^>]+id_book=${publisherId}[^>]*>([^<]+)</a>`,
      'i',
    );
    const htmlMatch = html.match(htmlRegex);
    if (htmlMatch) {
      return htmlMatch[1].trim();
    }
    return `Bộ sách ID ${publisherId}`;
  }

  private extractReadingTitle(html: string, readerUrl: string): string {
    const pathname = new URL(readerUrl).pathname;
    const escapedPathname = pathname.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(
      `\\[([^\\]]+)\\]\\([^\\)]*${escapedPathname}[^\\)]*\\)`,
      'i',
    );
    const match = html.match(regex);
    if (match) {
      return match[1].trim();
    }
    const htmlRegex = new RegExp(
      `<a[^>]+href=["'][^"']*${escapedPathname}[^"']*["'][^>]*>([^<]+)</a>`,
      'i',
    );
    const htmlMatch = html.match(htmlRegex);
    if (htmlMatch) {
      return htmlMatch[1].trim();
    }
    const parts = pathname.split('/');
    const slug = parts[parts.length - 1] || 'Sách';
    return slug.split('.')[0] || slug;
  }

  private async getOrCreateGrade(grade: number): Promise<number> {
    const existing = await this.databaseService.get<{ id: number }>(
      'SELECT id FROM catalog_grade WHERE grade = ?',
      [grade],
    );
    if (existing) {
      return existing.id;
    }
    const res = await this.databaseService.run(
      'INSERT INTO catalog_grade (grade, name) VALUES (?, ?)',
      [grade, `Lớp ${grade}`],
    );
    return res.lastID;
  }

  private async getOrCreatePublisher(
    publisherId: number,
    name: string,
  ): Promise<number> {
    const existing = await this.databaseService.get<{ id: number }>(
      'SELECT id FROM catalog_publisher WHERE publisher_id = ?',
      [publisherId],
    );
    if (existing) {
      return existing.id;
    }
    const res = await this.databaseService.run(
      'INSERT INTO catalog_publisher (publisher_id, name) VALUES (?, ?)',
      [publisherId, name],
    );
    return res.lastID;
  }

  private async persistCatalogDetail(
    gradeId: number,
    publisherId: number,
    title: string,
    url: string,
  ): Promise<boolean> {
    const existing = await this.databaseService.get<{ id: number }>(
      'SELECT id FROM catalog_detail WHERE url = ?',
      [url],
    );
    if (existing) {
      return false;
    }
    await this.databaseService.run(
      'INSERT INTO catalog_detail (catalog_grade_id, catalog_publisher_id, title, url, status) VALUES (?, ?, ?, ?, ?)',
      [gradeId, publisherId, title, url, 'pending'],
    );
    return true;
  }
}
