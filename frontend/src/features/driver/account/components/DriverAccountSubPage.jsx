import { ArrowLeft } from 'lucide-react';

const DriverAccountSubPage = ({ title, onBack, children }) => (
  <div className="flex-1 flex flex-col bg-bg min-h-dvh">
    <div className="bg-white px-4 pt-4 pb-4 shadow-sm flex items-center gap-3 shrink-0 sticky top-0 z-50">
      <button type="button" onClick={onBack} className="p-2 -ml-2" aria-label="Go back">
        <ArrowLeft className="w-5 h-5" />
      </button>
      <h1 className="text-lg font-bold text-text">{title}</h1>
    </div>
    <div className="flex-1 p-4 space-y-4">{children}</div>
  </div>
);

export default DriverAccountSubPage;
