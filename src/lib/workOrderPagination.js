// listWorkOrders canonical contract. Never silently treat failed/partial reads as empty.
export async function collectWorkOrderPages(invokePage) {
  const rows = [];
  const seenCursors = new Set();
  const seenIds = new Set();
  let cursor = null;
  do {
    const response = await invokePage({ limit: 200, ...(cursor ? { cursor } : {}) });
    const page = response?.data;
    if (!Array.isArray(page?.records) || typeof page.has_more !== 'boolean') {
      throw new Error('WORK_ORDER_LIST_INVALID_RESPONSE');
    }
    for (const row of page.records) {
      if (typeof row?.id !== 'string' || !row.id || seenIds.has(row.id)) {
        throw new Error('WORK_ORDER_LIST_INVALID_RECORD');
      }
      seenIds.add(row.id);
      rows.push(row);
    }
    if (!page.has_more) return rows;
    const next = page.next_cursor;
    if (typeof next !== 'string' || !next || seenCursors.has(next) || !page.records.length) {
      throw new Error('WORK_ORDER_LIST_INVALID_CURSOR');
    }
    seenCursors.add(next);
    cursor = next;
  } while (cursor);
  return rows;
}
