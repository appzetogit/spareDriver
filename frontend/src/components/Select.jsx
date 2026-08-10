import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, Check } from 'lucide-react';

const Select = ({
  label,
  options = [],
  value,
  onChange,
  placeholder = 'Select an option',
  error,
  containerClassName = '',
  searchable = false,
  openDirection = 'bottom',
  icon: Icon,
  prefilledLabel,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef(null);

  const selectedOption = options.find(opt => {
    const optVal = typeof opt === 'string' ? opt : opt.value;
    return String(optVal) === String(value);
  });

  const selectedImage =
    selectedOption && typeof selectedOption !== 'string'
      ? selectedOption.image
      : '';

  // If catalog options haven't loaded yet but we have a prefilled label from
  // the parent (e.g. populated API data), show that immediately so the user
  // sees the field is populated rather than blank.
  const displayLabel = selectedOption
    ? (typeof selectedOption === 'string' ? selectedOption : selectedOption.label)
    : (value && prefilledLabel) ? prefilledLabel : placeholder;

  const filteredOptions = options.filter(opt => {
    const label = typeof opt === 'string' ? opt : opt.label;
    return label.toLowerCase().includes(searchTerm.toLowerCase());
  });

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const dropdownClasses = openDirection === 'top'
    ? 'bottom-full mb-2'
    : 'top-full mt-2';

  const hasLeadingVisual = Boolean(Icon || selectedImage);
  const optionsHaveImages = options.some(
    (opt) => typeof opt !== 'string' && opt.image,
  );

  return (
    <div className={`flex flex-col gap-1.5 ${containerClassName}`} ref={dropdownRef}>
      {label && (
        <label className="text-sm font-medium text-text">{label}</label>
      )}
      <div className="relative">
        <button
          type="button"
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          className={`
            w-full h-10 bg-white !bg-white border rounded-xl pr-6 sm:pr-10 text-[11px] sm:text-sm text-left
            transition-all duration-200 flex items-center gap-1 sm:gap-2
            ${disabled ? 'opacity-60 cursor-not-allowed !bg-slate-50' : ''}
            ${isOpen ? 'border-primary ring-2 ring-primary/20' : 'border-border'}
            ${error ? 'border-danger' : ''}
            ${(!selectedOption && !(value && prefilledLabel)) ? 'text-text-muted' : 'text-text'}
            ${hasLeadingVisual ? 'pl-1.5 sm:pl-2.5' : 'pl-2.5 sm:pl-4'}
          `}
          style={{ backgroundColor: disabled ? undefined : '#ffffff' }}
        >
          {selectedImage ? (
            <img
              src={selectedImage}
              alt=""
              className="w-5 h-5 sm:w-6 sm:h-6 rounded object-contain bg-white shrink-0"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : Icon ? (
            <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-text-muted shrink-0" />
          ) : null}
          <span className="truncate leading-none block my-auto flex-1">{displayLabel}</span>
          <ChevronDown className={`absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-text-muted shrink-0 pointer-events-none transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && (
          <div
            className={`absolute z-[100] left-0 right-0 ${dropdownClasses} border border-border rounded-2xl shadow-2xl overflow-hidden animate-fade-in-up bg-surface`}
            style={{ backgroundColor: '#ffffff' }}
          >
            {searchable && (
              <div className="p-2 border-b border-border-light" style={{ backgroundColor: '#ffffff' }}>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                  <input
                    type="text"
                    placeholder="Search..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full h-9 bg-bg rounded-lg pl-9 pr-3 text-xs focus:outline-none"
                    autoFocus
                  />
                </div>
              </div>
            )}
            <div className="max-h-60 overflow-y-auto py-1" style={{ backgroundColor: '#ffffff' }}>
              {filteredOptions.length === 0 ? (
                <div className="px-4 py-3 text-center text-xs text-text-muted">No results found</div>
              ) : (
                filteredOptions.map((opt) => {
                  const optValue = typeof opt === 'string' ? opt : opt.value;
                  const optLabel = typeof opt === 'string' ? opt : opt.label;
                  const optImage = typeof opt === 'string' ? '' : opt.image;
                  const isSelected = String(optValue) === String(value);

                  return (
                    <button
                      key={optValue}
                      type="button"
                      onClick={() => {
                        onChange(optValue);
                        setIsOpen(false);
                        setSearchTerm('');
                      }}
                      className={`
                        w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-colors
                        ${isSelected
                          ? 'bg-primary-50 text-primary-dark font-medium'
                          : 'bg-surface text-text hover:bg-bg'}
                      `}
                      style={{ backgroundColor: isSelected ? '#fffbf0' : '#ffffff' }}
                    >
                      {optionsHaveImages && (
                        optImage ? (
                          <img
                            src={optImage}
                            alt=""
                            className="w-7 h-7 rounded object-contain bg-white border border-border/60 shrink-0"
                            onError={(e) => {
                              e.currentTarget.style.visibility = 'hidden';
                            }}
                          />
                        ) : (
                          <span className="w-7 h-7 shrink-0" />
                        )
                      )}
                      <span className="flex-1 truncate">{optLabel}</span>
                      {isSelected && <Check className="w-4 h-4 text-primary shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
      {error && <p className="text-xs text-danger mt-0.5">{error}</p>}
    </div>
  );
};

export default Select;
