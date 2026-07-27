import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, User } from 'lucide-react';
import Avatar from '../../../components/Avatar';
import { useCachedQuery } from '../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../store/lib/buildCacheKey';
import { useAdminUsersStore } from '../../../store/admin/useAdminUsersStore';
import ServerPaginatedTable from '../components/ServerPaginatedTable';
import RowActionsMenu from '../components/RowActionsMenu';
import UserFilters from '../components/ManageUsers/UserFilters';
import UserStats from '../components/ManageUsers/UserStats';

const ManageUsers = () => {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const queryParams = useMemo(
    () => ({ page, limit, search: debouncedSearch }),
    [page, limit, debouncedSearch],
  );

  const cacheKey = buildCacheKey('admin-users', queryParams);

  const { data, loading, error, refetch } = useCachedQuery(
    useAdminUsersStore,
    cacheKey,
    queryParams,
  );

  const users = data?.users ?? [];
  const pagination = data?.pagination ?? { total: 0, pages: 1 };

  const buildRowActions = useCallback(
    (row) => [
      {
        label: 'View profile',
        icon: User,
        onClick: () => navigate(`/admin/users/${row._id}/profile`),
      },
      {
        label: 'Analytics',
        icon: BarChart3,
        onClick: () => navigate(`/admin/users/${row._id}/analytics`),
      },
    ],
    [navigate],
  );

  const columns = useMemo(
    () => [
      {
        key: 'name',
        label: 'User',
        width: '34%',
        render: (val, row) => (
          <div className="flex items-center gap-3 py-1">
            <Avatar name={val} size="sm" src={row.profilePicture} />
            <div>
              <p className="font-semibold text-sm text-slate-800">{val}</p>
              <p className="text-xs text-slate-500 mt-0.5">{row.email}</p>
            </div>
          </div>
        ),
      },
      {
        key: 'phone_no',
        label: 'Phone',
        width: '20%',
        render: (val) => <span className="text-sm text-slate-600">{val || '—'}</span>,
      },
      {
        key: 'carsCount',
        label: 'Vehicles',
        width: '16%',
        render: (val) => (
          <span
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
              val > 0 ? 'bg-primary/10 text-primary-dark' : 'bg-slate-100 text-slate-500'
            }`}
          >
            {val} {val === 1 ? 'car' : 'cars'}
          </span>
        ),
      },
      {
        key: 'isActive',
        label: 'Status',
        width: '14%',
        render: (val) => (
          <span
            className={`text-xs font-semibold ${val ? 'text-emerald-600' : 'text-rose-600'}`}
          >
            {val ? 'Active' : 'Inactive'}
          </span>
        ),
      },
      {
        key: 'createdAt',
        label: 'Joined',
        width: '14%',
        className: 'hidden md:table-cell',
        render: (val) => (
          <span className="text-xs text-slate-500">
            {val ? new Date(val).toLocaleDateString('en-GB') : '—'}
          </span>
        ),
      },
      {
        key: 'actions',
        label: 'Actions',
        width: '80px',
        align: 'right',
        render: (_, row) => (
          <div className="flex items-center justify-end w-full" data-row-action onClick={(e) => e.stopPropagation()}>
            <RowActionsMenu items={buildRowActions(row)} />
          </div>
        ),
      },
    ],
    [buildRowActions, navigate],
  );

  const stats = useMemo(
    () => ({
      total: pagination.total,
      withCars: users.filter((u) => u.carsCount > 0).length,
    }),
    [users, pagination.total],
  );

  return (
    <div className="min-h-screen bg-slate-50 space-y-6 animate-fade-in-up">
      <UserFilters
        search={search}
        onSearchChange={(val) => {
          setSearch(val);
          setPage(1);
        }}
        onRefresh={refetch}
        refreshing={loading}
      />
      <UserStats {...stats} />

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <ServerPaginatedTable
        columns={columns}
        data={users}
        loading={loading}
        limit={limit}
        page={page}
        pagination={pagination}
        onPageChange={setPage}
        onRowClick={(row) => navigate(`/admin/users/${row._id}/profile`)}
        entityLabel="users"
        emptyMessage="No users found"
      />
    </div>
  );
};

export default ManageUsers;
