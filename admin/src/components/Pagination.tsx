export function Pagination({ page, total, limit, onPage }: { page: number; total: number; limit: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  return (
    <div className="pagination">
      <span className="muted">
        {total} total · page {page} of {pages}
      </span>
      <button className="small" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Prev
      </button>
      <button className="small" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next
      </button>
    </div>
  );
}
