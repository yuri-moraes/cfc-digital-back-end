import { paginate, paginatedResponse } from '../src/middleware/paginate.js';

describe('paginate', () => {
  test('returns defaults when query is empty', () => {
    expect(paginate({ query: {} })).toEqual({ page: 1, limit: 20, offset: 0 });
  });

  test('parses page and limit from query string', () => {
    expect(paginate({ query: { page: '3', limit: '10' } })).toEqual({ page: 3, limit: 10, offset: 20 });
  });

  test('clamps page to minimum 1 for zero input', () => {
    expect(paginate({ query: { page: '0' } }).page).toBe(1);
  });

  test('clamps page to minimum 1 for negative input', () => {
    expect(paginate({ query: { page: '-5' } }).page).toBe(1);
  });

  test('clamps limit to maximum 100', () => {
    expect(paginate({ query: { limit: '500' } }).limit).toBe(100);
  });

  test('clamps limit to minimum 1', () => {
    expect(paginate({ query: { limit: '0' } }).limit).toBe(1);
  });

  test('computes correct offset for page 2', () => {
    expect(paginate({ query: { page: '2', limit: '5' } }).offset).toBe(5);
  });
});

describe('paginatedResponse', () => {
  test('returns data and meta shape', () => {
    const result = paginatedResponse([1, 2], 50, { page: 2, limit: 10 });
    expect(result).toEqual({
      data: [1, 2],
      meta: { page: 2, limit: 10, total: 50, totalPages: 5 },
    });
  });

  test('rounds totalPages up', () => {
    expect(paginatedResponse([], 11, { page: 1, limit: 5 }).meta.totalPages).toBe(3);
  });

  test('totalPages is 0 when total is 0', () => {
    expect(paginatedResponse([], 0, { page: 1, limit: 20 }).meta.totalPages).toBe(0);
  });
});
