import { PaginationMeta } from '../types';

export const MAX_PER_PAGE = 100;

export interface PaginationParams {
  page: number;
  perPage: number;
  offset: number;
}

/**
 * Parse pagination params from a query object.
 */
export function getPagination(query: any = {}): PaginationParams {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const rawPerPage = parseInt(query.perPage, 10) || 10;
  const perPage = Math.min(MAX_PER_PAGE, Math.max(1, rawPerPage));
  return { page, perPage, offset: (page - 1) * perPage };
}

/**
 * Build the meta block for a paginated response.
 */
export function buildMeta(total: number, page: number, perPage: number): PaginationMeta {
  return {
    page,
    perPage,
    total,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  };
}

export default { getPagination, buildMeta, MAX_PER_PAGE };

