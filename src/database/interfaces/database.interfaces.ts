export interface IBook {
  id: number;
  title: string;
  description?: string;
  unsign_title?: string;
  url: string;
  total_pages: number;
  created_at: string;
  updated_at: string;
  deleted: number; // SQLite represents BOOLEAN as 0 or 1
}

export interface IBookPage {
  id: number;
  book_id: number;
  page_number: number;
  image_url: string;
  download_url?: string;
  created_at: string;
  updated_at: string;
  deleted: number;
}

export interface IAppConfig {
  key: string;
  value: string;
}

export type JobStep =
  | 'RESOLVE_BOOK'
  | 'SCRAPE_PAGES'
  | 'INIT_BOOK_RECORD'
  | 'DOWNLOAD_PAGES'
  | 'ZIP_DIRECTORY'
  | 'COMPLETED';

export interface IDownloadJob {
  id: number;
  url: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  total_pages: number;
  current_page: number;
  book_id: number | null;
  error_message?: string | null;
  current_step: JobStep;
  created_at: string;
  updated_at: string;
}
