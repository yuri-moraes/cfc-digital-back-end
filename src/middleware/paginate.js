export const paginate = (req) => {
  const rawPage = parseInt(req.query.page);
  const rawLimit = parseInt(req.query.limit);
  const page = Math.max(1, Number.isNaN(rawPage) ? 1 : rawPage);
  const limit = Math.min(100, Math.max(1, Number.isNaN(rawLimit) ? 20 : rawLimit));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};

export const paginatedResponse = (data, total, { page, limit }) => ({
  data,
  meta: {
    page,
    limit,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
  },
});
