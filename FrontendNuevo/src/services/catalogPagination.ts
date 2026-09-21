/** Configuration APIs cap pages at 100; do not truncate larger catalogs. */
export async function getAllCatalogPages<T>(
  fetchPage: (page: number, limit: number) => Promise<{ items: T[]; pagination: { total_pages: number } }>,
): Promise<T[]> {
  const first = await fetchPage(1, 100);
  const items = [...first.items];
  for (let page = 2; page <= first.pagination.total_pages; page += 1) {
    items.push(...(await fetchPage(page, 100)).items);
  }
  return items;
}
