import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import {
  IBook,
  IBookPage,
} from '../../database/interfaces/database.interfaces';
import { removeVietnameseAccents } from '../../common/string.utils';

@Injectable()
export class BookResolverService {
  constructor(private readonly databaseService: DatabaseService) {}

  async findByUrl(url: string): Promise<IBook | undefined> {
    return this.databaseService.get<IBook>(
      'SELECT * FROM book WHERE url = ? AND deleted = 0',
      [url],
    );
  }

  async findByTitle(title: string): Promise<IBook | undefined> {
    return this.databaseService.get<IBook>(
      'SELECT * FROM book WHERE title = ? AND deleted = 0',
      [title],
    );
  }

  async getDownloadedPageNumbers(bookId: number): Promise<Set<number>> {
    const rows = await this.databaseService.query<IBookPage>(
      'SELECT page_number FROM book_page WHERE book_id = ? AND deleted = 0',
      [bookId],
    );
    return new Set(rows.map((r) => r.page_number));
  }

  async createBook(input: {
    title: string;
    url: string;
    totalPages: number;
    description?: string;
  }): Promise<number> {
    const unsignTitle = removeVietnameseAccents(input.title);
    const description =
      input.description ?? `Book downloaded from ${input.url}`;
    const res = await this.databaseService.run(
      'INSERT INTO book (title, description, unsign_title, url, total_pages) VALUES (?, ?, ?, ?, ?)',
      [input.title, description, unsignTitle, input.url, input.totalPages],
    );
    return res.lastID;
  }

  async updateTotalPages(bookId: number, totalPages: number): Promise<void> {
    await this.databaseService.run(
      'UPDATE book SET total_pages = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [totalPages, bookId],
    );
  }

  async recordPage(
    bookId: number,
    pageNumber: number,
    imageUrl: string,
    downloadUrl: string,
  ): Promise<void> {
    await this.databaseService.run(
      'INSERT INTO book_page (book_id, page_number, image_url, download_url) VALUES (?, ?, ?, ?)',
      [bookId, pageNumber, imageUrl, downloadUrl],
    );
  }
}
