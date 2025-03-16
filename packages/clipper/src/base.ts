export interface ThumbnailsOptions {
  start?: number;
  end?: number;
  step?: number;
  quality?: number;
  mime?: string;
  width?: number;
}

export interface ThumbnailsResult {
  blob: Blob;
  timestamp: number;
}

export abstract class BaseClipper {
  constructor(protected source: File | Blob) {}

  abstract thumbnails(options?: ThumbnailsOptions): Promise<ThumbnailsResult[]>;

  abstract seek(time: number): Promise<ThumbnailsResult>;
}
