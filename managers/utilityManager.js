/**
 * Paginate an array
 * @param {Array} data - The full array to paginate
 * @param {number} page - The current page number (1-based)
 * @param {number} pageSize - Number of items per page
 * @returns {{
 *   data: Array,
 *   total: number,
 *   page: number,
 *   pageSize: number,
 *   totalPages: number
 * }}
 */
function paginateArray(data, page = 1, pageSize = 10) {
  const total = data.length;
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const paginatedData = data.slice(start, end);

  return {
    data: paginatedData,
    total,
    page,
    pageSize,
    totalPages,
  };
}

module.exports = { paginateArray };
