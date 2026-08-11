import { useState } from 'react';
import toast from 'react-hot-toast';
import { Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { downloadReportExport } from './reportUtils';

/**
 * Shared Excel + PDF download buttons for admin reports / ledgers.
 */
export default function ReportExportButtons({
  exportPath,
  queryParams = {},
  filenamePrefix = 'report',
  className = '',
}) {
  const [exporting, setExporting] = useState(null);

  const handleExport = async (format) => {
    setExporting(format);
    try {
      await downloadReportExport(exportPath, queryParams, filenamePrefix, format);
      toast.success(format === 'pdf' ? 'PDF downloaded' : 'Excel downloaded');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Export failed');
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={() => handleExport('excel')}
        disabled={Boolean(exporting)}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-dark text-xs font-semibold hover:bg-primary-dark disabled:opacity-50"
      >
        {exporting === 'excel' ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <FileSpreadsheet className="w-3.5 h-3.5" />
        )}
        Excel
      </button>
      <button
        type="button"
        onClick={() => handleExport('pdf')}
        disabled={Boolean(exporting)}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        {exporting === 'pdf' ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <FileText className="w-3.5 h-3.5" />
        )}
        PDF
      </button>
    </div>
  );
}

/** Compact icon-only variant for dense account page headers. */
export function ReportExportIconButtons({
  exportPath,
  queryParams = {},
  filenamePrefix = 'report',
}) {
  const [exporting, setExporting] = useState(null);

  const handleExport = async (format) => {
    setExporting(format);
    try {
      await downloadReportExport(exportPath, queryParams, filenamePrefix, format);
      toast.success(format === 'pdf' ? 'PDF downloaded' : 'Excel downloaded');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Export failed');
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => handleExport('excel')}
        disabled={Boolean(exporting)}
        title="Download Excel"
        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-border-light text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
      >
        {exporting === 'excel' ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Download className="w-4 h-4" />
        )}
        Excel
      </button>
      <button
        type="button"
        onClick={() => handleExport('pdf')}
        disabled={Boolean(exporting)}
        title="Download PDF"
        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-border-light text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
      >
        {exporting === 'pdf' ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <FileText className="w-4 h-4" />
        )}
        PDF
      </button>
    </div>
  );
}
