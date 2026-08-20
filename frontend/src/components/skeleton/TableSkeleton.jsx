import React from 'react';
import { Skeleton } from './Skeleton';

/**
 * Admin table loading placeholder.
 * Extra columns hide on smaller breakpoints so the skeleton matches the
 * responsive table layout on phone / tablet / desktop.
 */
export const TableSkeleton = ({ rows = 5, columns = 4 }) => {
  const colClass = (index) => {
    if (index >= 4) return 'hidden lg:block';
    if (index >= 3) return 'hidden md:block';
    if (index >= 2) return 'hidden sm:block';
    return '';
  };

  const visibleCount = Math.max(columns, 1);

  return (
    <div className="w-full">
      <div className="flex border-b border-gray-100 p-3 sm:p-4 gap-3 sm:gap-4">
        {Array.from({ length: visibleCount }).map((_, i) => (
          <Skeleton key={i} className={`h-4 flex-1 ${colClass(i)}`} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={rowIndex}
          className="flex border-b border-gray-50 p-3 sm:p-4 gap-3 sm:gap-4 items-center"
        >
          {Array.from({ length: visibleCount }).map((_, colIndex) => (
            <Skeleton key={colIndex} className={`h-4 flex-1 ${colClass(colIndex)}`} />
          ))}
        </div>
      ))}
    </div>
  );
};
