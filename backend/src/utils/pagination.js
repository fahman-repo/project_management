'use strict';

const MAX_PER_PAGE = 100;

/**
 * Parse pagination params from a query object.
 * @param {object} query
 * @returns {{page:number, perPage:number, offset:number}}
 */
function getPagination(query = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const rawPerPage = parseInt(query.perPage, 10) || 10;
  const perPage = Math.min(MAX_PER_PAGE, Math.max(1, rawPerPage));
  return { page, perPage, offset: (page - 1) * perPage };
}

/**
 * Build the meta block for a paginated response.
 * @param {number} total
 * @param {number} page
 * @param {number} perPage
 */
function buildMeta(total, page, perPage) {
  return {
    page,
    perPage,
    total,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  };
}

module.exports = { getPagination, buildMeta, MAX_PER_PAGE };
