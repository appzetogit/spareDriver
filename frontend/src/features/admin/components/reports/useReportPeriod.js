import { useMemo, useState } from 'react';
import { buildReportQueryParams } from './reportUtils';

export function useReportPeriod(defaultPeriod = '30d') {
  const [period, setPeriod] = useState(defaultPeriod);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const queryParams = useMemo(
    () => buildReportQueryParams({ period, fromDate, toDate }),
    [period, fromDate, toDate],
  );

  return {
    period,
    setPeriod,
    fromDate,
    setFromDate,
    toDate,
    setToDate,
    queryParams,
  };
}
