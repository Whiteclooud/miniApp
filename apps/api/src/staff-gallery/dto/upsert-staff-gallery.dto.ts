export interface UpsertStaffGalleryDto {
  title?: string;
  imageUrl?: string;
  coverImageUrl?: string;
  imageUrls?: string[] | string;
  description?: string;
  tags?: string[] | string;
  publishedAt?: string;
  sortOrder?: number;
  status?: string;
}
