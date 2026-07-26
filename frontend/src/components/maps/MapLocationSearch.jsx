import { useRef } from 'react';
import { Search } from 'lucide-react';
import { useMapPlaceSearch } from '../../hooks/useMapPlaceSearch';

const MapLocationSearch = ({ maps, map, enabled, onSelect, className = '' }) => {
  const inputRef = useRef(null);

  useMapPlaceSearch(inputRef, { maps, map, enabled, onSelect });

  return (
    <div className={className}>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">Search location</label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          name="map-location-search"
          placeholder="Search city or area in India…"
          className="w-full h-11 pl-9 pr-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          autoComplete="off"
        />
      </div>
    </div>
  );
};

export default MapLocationSearch;
