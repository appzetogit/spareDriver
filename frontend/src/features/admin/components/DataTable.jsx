import { useState, useMemo } from 'react';
import { Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

/**
 * DataTable — Reusable sortable table with search and pagination.
 *
 * @param {Array}  columns      - [{ key, label, render?, sortable?, width? }]
 * @param {Array}  data         - Array of row objects
 * @param {string} searchPlaceholder
 * @param {number} pageSize     - Rows per page (default 8)
 * @param {Function} onRowClick - Optional row click handler
 * @param {ReactNode} actions   - Optional top-right action buttons
 */
const CellContent = ({ children }) => (
  <div className="max-h-16 overflow-auto text-sm">{children}</div>
);

const DataTable = ({
  columns = [],
  data = [],
  searchPlaceholder = 'Search...',
  pageSize = 8,
  onRowClick,
  getRowClassName,
  actions,
  showSearch = true,
  showToolbar = true,
  embedded = false,
  bodyMaxHeight = '28rem',
  minWidth = 'min-w-full lg:min-w-[960px]',
}) => {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [currentPage, setCurrentPage] = useState(1);

  // Filter
  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter((row) =>
      columns.some((col) => {
        const val = row[col.key];
        return val && String(val).toLowerCase().includes(q);
      })
    );
  }, [data, search, columns]);

  // Sort
  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const aVal = a[sortKey] ?? '';
      const bVal = b[sortKey] ?? '';
      const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  // Paginate
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paginated = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  // Reset to first page when search changes
  const handleSearchChange = (e) => {
    setSearch(e.target.value);
    setCurrentPage(1);
  };

  return (
    <div className="w-full">
      {/* Toolbar */}
      {showToolbar && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          {showSearch && (
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder={searchPlaceholder}
                value={search}
                onChange={handleSearchChange}
                className="w-full h-10 pl-10 pr-4 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-300 focus:ring-1 focus:ring-slate-200 transition-all"
              />
            </div>
          )}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}

      {/* Table Container */}
      <div
        className={
          embedded ? 'overflow-hidden' : 'bg-white rounded-2xl border border-slate-200 overflow-hidden'
        }
      >
        <div className="overflow-auto" style={{ maxHeight: bodyMaxHeight }}>
          <table className={`w-full ${minWidth} table-auto md:table-fixed`}>
            <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-100">
              <tr>
                {columns.map((col) => {
                  const alignClass = col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left';
                  const justifyClass = col.align === 'center' ? 'justify-center' : col.align === 'right' ? 'justify-end' : 'justify-start';
                  const padClass = col.compact ? 'px-1 sm:px-2' : 'px-1.5 sm:px-4';
                  return (
                    <th
                      key={col.key}
                      className={`
                        ${padClass} py-3 text-xs font-medium text-slate-500 uppercase tracking-wider ${alignClass}
                        ${col.sortable !== false ? 'cursor-pointer select-none hover:text-slate-700 transition-colors' : ''}
                        ${col.className || ''}
                      `}
                      style={col.width ? { width: col.width, minWidth: col.width } : undefined}
                      onClick={() => col.sortable !== false && handleSort(col.key)}
                    >
                      <div className={`flex items-center gap-1.5 min-w-0 ${justifyClass}`}>
                        <span className="truncate">{col.label}</span>
                        {sortKey === col.key && (
                          <span className="text-slate-400 text-xs shrink-0">
                            {sortDir === 'asc' ? '↑' : '↓'}
                          </span>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <p className="text-sm text-slate-400">No results found</p>
                      {search && (
                        <button
                          type="button"
                          onClick={() => setSearch('')}
                          className="text-xs text-slate-500 hover:text-slate-700 underline-offset-2 hover:underline"
                        >
                          Clear search
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                paginated.map((row, idx) => (
                  <tr
                    key={row.id || row._id || idx}
                    onClick={(e) => {
                      if (
                        e.target.closest('[data-row-action]') ||
                        e.target.closest('input, button, a, label, select, textarea')
                      ) {
                        return;
                      }
                      onRowClick?.(row);
                    }}
                    className={`
                      border-b border-slate-50 last:border-b-0 transition-colors
                      ${onRowClick ? 'cursor-pointer hover:bg-slate-50' : ''}
                      ${getRowClassName?.(row) || ''}
                    `}
                  >
                    {columns.map((col) => {
                      const alignClass = col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left';
                      const padClass = col.compact ? 'px-1 sm:px-2' : 'px-1.5 sm:px-4';
                      const cell = col.render ? (
                        col.render(row[col.key], row)
                      ) : (
                        <span className="block whitespace-nowrap">
                          {row[col.key] !== undefined && row[col.key] !== null ? row[col.key] : '—'}
                        </span>
                      );

                      return (
                        <td
                          key={col.key}
                          className={`${padClass} py-3 text-sm text-slate-700 align-middle ${col.unclamp ? 'overflow-visible' : 'max-w-0'} ${alignClass} ${col.className || ''}`}
                          style={col.width ? { width: col.width, minWidth: col.width } : undefined}
                        >
                          {col.unclamp ? cell : <CellContent>{cell}</CellContent>}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!embedded && sorted.length > pageSize && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-4 py-4 border-t border-slate-100 bg-white">
            <p className="text-xs text-slate-500">
              Showing{' '}
              <span className="font-medium text-slate-700">
                {(currentPage - 1) * pageSize + 1}
              </span>
              {' '}-{' '}
              <span className="font-medium text-slate-700">
                {Math.min(currentPage * pageSize, sorted.length)}
              </span>
              {' '}of{' '}
              <span className="font-medium text-slate-700">{sorted.length}</span>
              {' '}results
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="p-2 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                aria-label="First page"
              >
                <ChevronsLeft className="w-4 h-4 text-slate-600" />
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-2 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-4 h-4 text-slate-600" />
              </button>
              <div className="min-w-[80px] px-3 py-1.5 text-center">
                <span className="text-sm font-medium text-slate-700">
                  {currentPage}
                </span>
                <span className="text-sm text-slate-400"> / {totalPages}</span>
              </div>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-2 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                aria-label="Next page"
              >
                <ChevronRight className="w-4 h-4 text-slate-600" />
              </button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="p-2 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                aria-label="Last page"
              >
                <ChevronsRight className="w-4 h-4 text-slate-600" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DataTable;




// import { useState, useMemo } from 'react';
// import { Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

// /**
//  * DataTable — Reusable sortable table with search and pagination.
//  *
//  * @param {Array}  columns      - [{ key, label, render?, sortable?, width? }]
//  * @param {Array}  data         - Array of row objects
//  * @param {string} searchPlaceholder
//  * @param {number} pageSize     - Rows per page (default 8)
//  * @param {Function} onRowClick - Optional row click handler
//  * @param {ReactNode} actions   - Optional top-right action buttons
//  */
// const DataTable = ({
//   columns = [],
//   data = [],
//   searchPlaceholder = 'Search...',
//   pageSize = 8,
//   onRowClick,
//   actions,
//   showSearch = true,
//   showToolbar = true,
// }) => {
//   const [search, setSearch] = useState('');
//   const [sortKey, setSortKey] = useState(null);
//   const [sortDir, setSortDir] = useState('asc');
//   const [currentPage, setCurrentPage] = useState(1);

//   // Filter
//   const filtered = useMemo(() => {
//     if (!search.trim()) return data;
//     const q = search.toLowerCase();
//     return data.filter((row) =>
//       columns.some((col) => {
//         const val = row[col.key];
//         return val && String(val).toLowerCase().includes(q);
//       })
//     );
//   }, [data, search, columns]);

//   // Sort
//   const sorted = useMemo(() => {
//     if (!sortKey) return filtered;
//     return [...filtered].sort((a, b) => {
//       const aVal = a[sortKey] ?? '';
//       const bVal = b[sortKey] ?? '';
//       const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
//       return sortDir === 'asc' ? cmp : -cmp;
//     });
//   }, [filtered, sortKey, sortDir]);

//   // Paginate
//   const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
//   const paginated = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

//   const handleSort = (key) => {
//     if (sortKey === key) {
//       setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
//     } else {
//       setSortKey(key);
//       setSortDir('asc');
//     }
//   };

//   return (
//     <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
//       {/* Toolbar */}
//       {showToolbar && (
//         <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 border-b border-gray-50">
//           {showSearch ? (
//             <div className="relative w-full sm:w-72">
//               <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
//               <input
//                 type="text"
//                 placeholder={searchPlaceholder}
//                 value={search}
//                 onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
//                 className="w-full h-10 bg-gray-50 rounded-xl pl-10 pr-4 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 border border-transparent focus:border-primary/30 transition-all"
//               />
//             </div>
//           ) : <div />}
//           {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
//         </div>
//       )}

//       {/* Table */}
//       <div className="overflow-x-auto">
//         <table className="w-full">
//           <thead>
//             <tr className="border-b border-gray-50">
//               {columns.map((col) => (
//                 <th
//                   key={col.key}
//                   className={`px-4 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wider whitespace-nowrap
//                     ${col.sortable !== false ? 'cursor-pointer hover:text-text select-none' : ''}
//                     ${col.className || ''}
//                   `}
//                   style={col.width ? { width: col.width } : {}}
//                   onClick={() => col.sortable !== false && handleSort(col.key)}
//                 >
//                   <span className="inline-flex items-center gap-1">
//                     {col.label}
//                     {sortKey === col.key && (
//                       <span className="text-primary">{sortDir === 'asc' ? '↑' : '↓'}</span>
//                     )}
//                   </span>
//                 </th>
//               ))}
//             </tr>
//           </thead>
//           <tbody>
//             {paginated.length === 0 ? (
//               <tr>
//                 <td colSpan={columns.length} className="px-4 py-12 text-center">
//                   <p className="text-sm text-text-muted">No results found</p>
//                 </td>
//               </tr>
//             ) : (
//               paginated.map((row, idx) => (
//                 <tr
//                   key={row.id || idx}
//                   onClick={() => onRowClick?.(row)}
//                   className={`border-b border-gray-50 last:border-b-0 transition-colors
//                     ${onRowClick ? 'cursor-pointer hover:bg-gray-50/50' : ''}
//                   `}
//                 >
//                   {columns.map((col) => (
//                     <td key={col.key} className={`px-4 py-3 text-sm text-text whitespace-nowrap ${col.className || ''}`}>
//                       {col.render ? col.render(row[col.key], row) : row[col.key]}
//                     </td>
//                   ))}
//                 </tr>
//               ))
//             )}
//           </tbody>
//         </table>
//       </div>

//       {/* Pagination */}
//       {sorted.length > pageSize && (
//         <div className="flex items-center justify-between px-4 py-3 border-t border-gray-50">
//           <p className="text-xs text-text-muted">
//             Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, sorted.length)} of {sorted.length}
//           </p>
//           <div className="flex items-center gap-1">
//             <button
//               onClick={() => setCurrentPage(1)}
//               disabled={currentPage === 1}
//               className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed text-text-secondary"
//             >
//               <ChevronsLeft className="w-4 h-4" />
//             </button>
//             <button
//               onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
//               disabled={currentPage === 1}
//               className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed text-text-secondary"
//             >
//               <ChevronLeft className="w-4 h-4" />
//             </button>
//             <span className="px-3 py-1 text-xs font-medium text-text">
//               {currentPage} / {totalPages}
//             </span>
//             <button
//               onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
//               disabled={currentPage === totalPages}
//               className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed text-text-secondary"
//             >
//               <ChevronRight className="w-4 h-4" />
//             </button>
//             <button
//               onClick={() => setCurrentPage(totalPages)}
//               disabled={currentPage === totalPages}
//               className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed text-text-secondary"
//             >
//               <ChevronsRight className="w-4 h-4" />
//             </button>
//           </div>
//         </div>
//       )}
//     </div>
//   );
// };

// export default DataTable;
