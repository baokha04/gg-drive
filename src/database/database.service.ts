import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import * as sqlite3 from 'sqlite3';
import * as path from 'path';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private db: sqlite3.Database;

  async onModuleInit() {
    const dbPath = path.resolve(process.cwd(), 'database.db');
    this.logger.log(`Initializing SQLite database at: ${dbPath}`);
    this.db = new sqlite3.Database(dbPath);
    await this.initSchema();
  }

  onModuleDestroy() {
    if (this.db) {
      this.db.close((err) => {
        if (err) {
          this.logger.error('Error closing SQLite database', err.stack);
        } else {
          this.logger.log('SQLite database connection closed.');
        }
      });
    }
  }

  private async initSchema(): Promise<void> {
    await this.exec(`
      CREATE TABLE IF NOT EXISTS book (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        unsign_title TEXT,
        url TEXT UNIQUE NOT NULL,
        total_pages INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted BOOLEAN DEFAULT 0
      );
    `);
    
    await this.exec(`
      CREATE TABLE IF NOT EXISTS book_page (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book_id INTEGER,
        page_number INTEGER NOT NULL,
        image_url TEXT NOT NULL,
        download_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted BOOLEAN DEFAULT 0,
        FOREIGN KEY(book_id) REFERENCES book(id)
      );
    `);

    await this.exec(`
      CREATE TABLE IF NOT EXISTS gg_folder (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        folder_id TEXT UNIQUE NOT NULL,
        folder_name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted BOOLEAN DEFAULT 0
      );
    `);

    await this.exec(`
      CREATE TABLE IF NOT EXISTS gg_drive (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book_id INTEGER,
        gg_folder_id INTEGER,
        zip_file_url TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted BOOLEAN DEFAULT 0,
        FOREIGN KEY(book_id) REFERENCES book(id),
        FOREIGN KEY(gg_folder_id) REFERENCES gg_folder(id)
      );
    `);
  }

  exec(sql: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.db.exec(sql, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  query<T>(sql: string, params: any[] = []): Promise<T[]> {
    return new Promise<T[]>((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows as T[]);
      });
    });
  }

  get<T>(sql: string, params: any[] = []): Promise<T | undefined> {
    return new Promise<T | undefined>((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row as T | undefined);
      });
    });
  }

  run(sql: string, params: any[] = []): Promise<{ lastID: number; changes: number }> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }
}
