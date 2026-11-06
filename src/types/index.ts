export type BookFormat = 'pdf' | 'epub';

export type ReadingMode = 'scroll' | 'paginated';

export type ReaderTheme = 'light' | 'sepia' | 'dark' | 'amoled';

export type ReaderFontFamily = 'literata' | 'merriweather' | 'lora' | 'atkinson' | 'inter' | 'system';
export type ReaderLineHeight = 1.4 | 1.6 | 1.8 | 2.0;
export type ReaderMarginSize = 'small' | 'medium' | 'large';

export interface Bookmark {
  id: string;
  pageOrCfi: string | number;
  label: string;
  createdAt: number;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  format: BookFormat;
  coverUrl?: string;
  fileData?: ArrayBuffer | Blob;
  addedAt: number;
  lastReadAt?: number;
  fileSize: number;
  totalPages?: number;
  currentPage?: number;
  currentCfi?: string;
  progress: number; // 0 to 100
  readingMode: ReadingMode;
  theme: ReaderTheme;
  fontSize: number; // percentage or px (e.g. 16)
  fontFamily?: ReaderFontFamily;
  lineHeight?: ReaderLineHeight;
  marginSize?: ReaderMarginSize;
  bookmarks: Bookmark[];
  description?: string;
  /** Se o livro está arquivado / oculto da estante principal */
  isArchived?: boolean;
  /** Última modificação dos metadados (usado na sincronização com o Drive) */
  updatedAt?: number;
  /** ID do arquivo do livro no Google Drive */
  driveFileId?: string;
}

export interface DeletedEntry {
  at: number;
  driveFileId?: string;
}

export interface FreeBookItem {
  id: string;
  title: string;
  author: string;
  coverUrl: string;
  format: BookFormat;
  downloadUrl: string;
  genre: string;
  description: string;
}
