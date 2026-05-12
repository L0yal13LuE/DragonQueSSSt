interface PaginationResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function paginateArray<T>(data: T[], page: number = 1, pageSize: number = 10): PaginationResult<T> {
  const total: number = data.length;
  const totalPages: number = Math.ceil(total / pageSize);
  const start: number = (page - 1) * pageSize;
  const end: number = start + pageSize;
  const paginatedData: T[] = data.slice(start, end);

  return {
    data: paginatedData,
    total,
    page,
    pageSize,
    totalPages,
  };
}

export { paginateArray, PaginationResult };
