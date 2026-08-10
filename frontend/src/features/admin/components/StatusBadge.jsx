import { getApprovalStatusStyles, formatApprovalStatus } from '../utils/approvalStatus';

const StatusBadge = ({ status, className = '' }) => (
  <span
    className={`inline-flex items-center px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[10px] sm:text-[11px] font-medium capitalize tracking-wide whitespace-nowrap shrink-0 ${getApprovalStatusStyles(status)} ${className}`}
  >
    {formatApprovalStatus(status)}
  </span>
);

export default StatusBadge;
