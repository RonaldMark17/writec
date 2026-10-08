import { useState } from "react";

export function usePagination(items, resetKey, pageSize = 10) {
  const key = JSON.stringify(resetKey);
  const [selection, setSelection] = useState({ key, page: 1 });
  if (selection.key !== key) setSelection({ key, page: 1 });
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const page = selection.key === key ? Math.min(selection.page, pageCount) : 1;
  return {
    items: items.slice((page - 1) * pageSize, page * pageSize),
    page, pageCount, total: items.length, pageSize,
    setPage: (next) => setSelection({ key, page: Math.max(1, Math.min(next, pageCount)) }),
  };
}

export default function Pagination({ pagination, label = "Results" }) {
  const { page, pageCount, setPage } = pagination;
  if (pageCount <= 1) return null;
  return <nav aria-label={`${label} pagination`} className="col-span-full my-3 flex flex-wrap items-center justify-center gap-3 text-sm">
    <button type="button" disabled={page === 1} onClick={() => setPage(page - 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Previous</button>
    <span role="status">Page {page} of {pageCount}</span>
    <button type="button" disabled={page === pageCount} onClick={() => setPage(page + 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Next</button>
  </nav>;
}

export function PaginatedList({ items, resetKey, label, children }) {
  const pagination = usePagination(items, resetKey);
  return <>{children(pagination.items)}<Pagination pagination={pagination} label={label} /></>;
}
