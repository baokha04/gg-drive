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

export interface IGgFolder {
  id: number;
  folder_id: string;
  folder_name: string;
  created_at: string;
  updated_at: string;
  deleted: number;
}

export interface IGgDrive {
  id: number;
  book_id: number;
  gg_folder_id?: number | null;
  zip_file_url: string;
  created_at: string;
  updated_at: string;
  deleted: number;
}
