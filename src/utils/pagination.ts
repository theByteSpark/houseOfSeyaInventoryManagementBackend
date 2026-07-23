import type { Request } from 'express';

export interface PaginationParams {
  page: number;
  pageSize: number;
  search: string;
  sortBy: string | undefined;
  sortDir: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

const ALLOWED_PAGE_SIZES = [10, 20, 50];

export function isPaginationRequested(req: Request): boolean {
  return typeof req.query.page !== 'undefined';
}

export function parsePaginationParams(req: Request, allowedSortFields: string[]): PaginationParams {
  const rawPage = Number(req.query.page);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;

  const rawPageSize = Number(req.query.pageSize);
  const pageSize = ALLOWED_PAGE_SIZES.includes(rawPageSize) ? rawPageSize : 10;

  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

  const rawSortBy = typeof req.query.sortBy === 'string' ? req.query.sortBy : undefined;
  const sortBy = rawSortBy && allowedSortFields.includes(rawSortBy) ? rawSortBy : undefined;

  const sortDir = req.query.sortDir === 'asc' ? 'asc' : 'desc';

  return { page, pageSize, search, sortBy, sortDir };
}
