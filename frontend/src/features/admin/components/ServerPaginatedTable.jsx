import { ChevronLeft, ChevronRight } from 'lucide-react';
import DataTable from './DataTable';
import { TableSkeleton } from '../../../components/skeleton/TableSkeleton';

/**
 * DataTable wrapper with server-side pagination controls (reusable across admin pages).
 */
const ServerPaginatedTable = ({
  columns,
  data,
  loading,
  page,
  limit,
  pagination,
  onPageChange,
  onRowClick,
  getRowClassName,
  entityLabel = 'items',
  emptyMessage = 'No results found',
  minWidth,
}) => {
  // Calculate display range
  const startItem = pagination.total === 0 ? 0 : Math.min((page - 1) * limit + 1, pagination.total);
  const endItem = Math.min(page * limit, pagination.total);
  const totalPages = Math.max(pagination.pages, 1);

  return (
    <div className="w-full bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        {loading && data.length === 0 ? (
          <TableSkeleton rows={limit} columns={columns.length} />
        ) : (
          <DataTable
            columns={columns}
            data={data}
            onRowClick={onRowClick}
            getRowClassName={getRowClassName}
            showSearch={false}
            showToolbar={false}
            embedded
            pageSize={limit}
            bodyMaxHeight="28rem"
            minWidth={minWidth || 'w-full min-w-0'}
          />
        )}
      </div>

      {/* Pagination Controls */}
      {!loading && pagination.total > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 px-3 sm:px-6 py-3 sm:py-4 border-t border-slate-200 bg-slate-50">
          {/* Results info */}
          <div className="text-xs sm:text-sm text-slate-500">
            Showing{' '}
            <span className="font-medium text-slate-700">{startItem}</span>
            {' '}-{' '}
            <span className="font-medium text-slate-700">{endItem}</span>
            {' '}of{' '}
            <span className="font-medium text-slate-700">
              {pagination.total.toLocaleString()}
            </span>
            {' '}{entityLabel}
          </div>

          {/* Pagination buttons */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Previous button */}
            <button
              type="button"
              onClick={() => onPageChange(Math.max(1, page - 1))}
              disabled={page === 1}
              className="inline-flex items-center gap-1.5 sm:gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Previous</span>
            </button>

            {/* Page indicator */}
            <div className="px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-white border border-slate-200 text-xs sm:text-sm font-medium text-slate-700">
              Page {page} of {totalPages}
            </div>

            {/* Next button */}
            <button
              type="button"
              onClick={() => onPageChange(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages || totalPages === 0}
              className="inline-flex items-center gap-1.5 sm:gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && data.length === 0 && pagination.total === 0 && (
        <div className="py-16 text-center">
          <p className="text-sm text-slate-400">{emptyMessage}</p>
        </div>
      )}
    </div>
  );
};

export default ServerPaginatedTable;




// import { ChevronLeft, ChevronRight } from 'lucide-react';
// import DataTable from './DataTable';
// import { TableSkeleton } from '../../../components/skeleton/TableSkeleton';

// /**
//  * DataTable wrapper with server-side pagination controls (reusable across admin pages).
//  */
// const ServerPaginatedTable = ({
//   columns,
//   data,
//   loading,
//   page,
//   limit,
//   pagination,
//   onPageChange,
//   onRowClick,
//   entityLabel = 'items',
//   emptyMessage = 'No results found',
// }) => (
//   <div className="bg-white rounded-[28px] border border-slate-200 overflow-hidden shadow-sm">
//     <div className="overflow-auto">
//       {loading && data.length === 0 ? (
//         <TableSkeleton rows={limit} columns={columns.length} />
//       ) : (
//         <DataTable
//           columns={columns}
//           data={data}
//           onRowClick={onRowClick}
//           showSearch={false}
//           showToolbar={false}
//         />
//       )}
//     </div>

//     <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 px-6 py-5 border-t border-slate-100 bg-slate-50">
//       <span className="text-sm text-slate-500">
//         Showing{' '}
//         <span className="font-semibold text-slate-800">
//           {pagination.total === 0 ? 0 : Math.min((page - 1) * limit + 1, pagination.total)}
//         </span>{' '}
//         to{' '}
//         <span className="font-semibold text-slate-800">
//           {Math.min(page * limit, pagination.total)}
//         </span>{' '}
//         of <span className="font-semibold text-slate-800">{pagination.total}</span> {entityLabel}
//       </span>

//       <div className="flex items-center gap-3">
//         <button
//           type="button"
//           onClick={() => onPageChange(Math.max(1, page - 1))}
//           disabled={page === 1}
//           className="w-10 h-10 rounded-xl border border-slate-200 bg-white flex items-center justify-center hover:bg-primary hover:text-white transition-all disabled:opacity-40"
//         >
//           <ChevronLeft className="w-4 h-4" />
//         </button>
//         <div className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-700">
//           Page {page} of {Math.max(pagination.pages, 1)}
//         </div>
//         <button
//           type="button"
//           onClick={() => onPageChange(Math.min(pagination.pages, page + 1))}
//           disabled={page >= pagination.pages || pagination.pages === 0}
//           className="w-10 h-10 rounded-xl border border-slate-200 bg-white flex items-center justify-center hover:bg-primary hover:text-white transition-all disabled:opacity-40"
//         >
//           <ChevronRight className="w-4 h-4" />
//         </button>
//       </div>
//     </div>
//   </div>
// );

// export default ServerPaginatedTable;
