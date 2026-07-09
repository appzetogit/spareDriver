import { useEffect, useRef } from 'react';
import { PLACES_COUNTRY } from '../constants/mapDefaults';

const DROPDOWN_CLASS = 'place-search-dropdown';
const DEBOUNCE_MS = 280;

function placeFromFields(place) {
  const loc = place?.location;
  if (!loc) return null;
  return {
    lat: typeof loc.lat === 'function' ? loc.lat() : loc.lat,
    lng: typeof loc.lng === 'function' ? loc.lng() : loc.lng,
    name: place.displayName || '',
    address: place.formattedAddress || '',
  };
}

function positionDropdown(dropdown, input) {
  const rect = input.getBoundingClientRect();
  dropdown.style.top = `${rect.bottom + window.scrollY + 4}px`;
  dropdown.style.left = `${rect.left + window.scrollX}px`;
  dropdown.style.width = `${rect.width}px`;
}

function hideDropdown(dropdown) {
  dropdown.innerHTML = '';
  dropdown.style.display = 'none';
}

/**
 * Places Autocomplete (New) + text search on Enter (India).
 * Uses AutocompleteSuggestion.fetchAutocompleteSuggestions — required for
 * Google Cloud projects created after March 2025 (legacy Places API off).
 */
export function useMapPlaceSearch(inputRef, { maps, map, enabled, onSelect }) {
  const onSelectRef = useRef(onSelect);
  const sessionTokenRef = useRef(null);
  const debounceRef = useRef(null);
  const dropdownRef = useRef(null);
  const suggestionsRef = useRef([]);
  const activeIndexRef = useRef(-1);

  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!enabled || !maps || !inputRef.current) return undefined;

    let cancelled = false;
    const input = inputRef.current;

    if (!dropdownRef.current) {
      const el = document.createElement('div');
      el.className = DROPDOWN_CLASS;
      el.setAttribute('role', 'listbox');
      document.body.appendChild(el);
      dropdownRef.current = el;
    }
    const dropdown = dropdownRef.current;

    const selectPlace = (result) => {
      if (result) onSelectRef.current(result);
      hideDropdown(dropdown);
      suggestionsRef.current = [];
      activeIndexRef.current = -1;
      sessionTokenRef.current = null;
    };

    const resolvePrediction = async (placePrediction) => {
      const place = placePrediction.toPlace();
      await place.fetchFields({
        fields: ['location', 'displayName', 'formattedAddress'],
      });
      return placeFromFields(place);
    };

    const searchByText = async (query) => {
      const { Place } = await window.google.maps.importLibrary('places');
      const { places } = await Place.searchByText({
        textQuery: query,
        fields: ['location', 'displayName', 'formattedAddress'],
        region: PLACES_COUNTRY,
        maxResultCount: 1,
      });
      const place = places?.[0];
      if (!place) return null;
      await place.fetchFields({
        fields: ['location', 'displayName', 'formattedAddress'],
      });
      return placeFromFields(place);
    };

    const renderSuggestions = () => {
      const items = suggestionsRef.current;
      if (!items.length) {
        hideDropdown(dropdown);
        return;
      }
      positionDropdown(dropdown, input);
      dropdown.style.display = 'block';
      dropdown.innerHTML = items
        .map((prediction, index) => {
          const main = prediction.mainText?.text || prediction.text?.text || '';
          const secondary = prediction.secondaryText?.text || '';
          const active = index === activeIndexRef.current ? ' is-active' : '';
          return `<button type="button" class="place-search-item${active}" data-index="${index}" role="option">
            <span class="place-search-item-main">${main}</span>
            ${secondary ? `<span class="place-search-item-sub">${secondary}</span>` : ''}
          </button>`;
        })
        .join('');
    };

    const fetchSuggestions = async (value) => {
      const trimmed = value?.trim();
      if (!trimmed) {
        suggestionsRef.current = [];
        hideDropdown(dropdown);
        return;
      }

      try {
        const { AutocompleteSessionToken, AutocompleteSuggestion } =
          await window.google.maps.importLibrary('places');
        if (!sessionTokenRef.current) {
          sessionTokenRef.current = new AutocompleteSessionToken();
        }

        const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: trimmed,
          sessionToken: sessionTokenRef.current,
          includedRegionCodes: [PLACES_COUNTRY],
        });

        if (cancelled) return;

        suggestionsRef.current = suggestions
          .map((s) => s.placePrediction)
          .filter(Boolean)
          .slice(0, 6);
        activeIndexRef.current = -1;
        renderSuggestions();
      } catch (err) {
        console.error('[Places API (New)]', err);
        suggestionsRef.current = [];
        hideDropdown(dropdown);
      }
    };

    const onInput = () => {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        fetchSuggestions(input.value);
      }, DEBOUNCE_MS);
    };

    const onFocus = () => {
      if (suggestionsRef.current.length) renderSuggestions();
    };

    const onBlur = () => {
      setTimeout(() => hideDropdown(dropdown), 150);
    };

    const onKeyDown = async (e) => {
      const items = suggestionsRef.current;

      if (e.key === 'ArrowDown' && items.length) {
        e.preventDefault();
        activeIndexRef.current = Math.min(activeIndexRef.current + 1, items.length - 1);
        renderSuggestions();
        return;
      }

      if (e.key === 'ArrowUp' && items.length) {
        e.preventDefault();
        activeIndexRef.current = Math.max(activeIndexRef.current - 1, 0);
        renderSuggestions();
        return;
      }

      if (e.key !== 'Enter') return;
      e.preventDefault();
      e.stopPropagation();

      const picked =
        activeIndexRef.current >= 0
          ? items[activeIndexRef.current]
          : items[0];

      if (picked) {
        try {
          selectPlace(await resolvePrediction(picked));
        } catch (err) {
          console.error('[Places API (New)]', err);
        }
        return;
      }

      const query = input.value?.trim();
      if (!query) return;
      try {
        selectPlace(await searchByText(query));
      } catch (err) {
        console.error('[Places API (New)]', err);
      }
    };

    const onDropdownClick = async (e) => {
      const btn = e.target.closest('.place-search-item');
      if (!btn) return;
      const index = Number(btn.dataset.index);
      const prediction = suggestionsRef.current[index];
      if (!prediction) return;
      try {
        selectPlace(await resolvePrediction(prediction));
      } catch (err) {
        console.error('[Places API (New)]', err);
      }
    };

    const onScrollOrResize = () => {
      if (dropdown.style.display === 'block') positionDropdown(dropdown, input);
    };

    input.addEventListener('input', onInput);
    input.addEventListener('focus', onFocus);
    input.addEventListener('blur', onBlur);
    input.addEventListener('keydown', onKeyDown);
    dropdown.addEventListener('mousedown', (e) => e.preventDefault());
    dropdown.addEventListener('click', onDropdownClick);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);

    return () => {
      cancelled = true;
      clearTimeout(debounceRef.current);
      input.removeEventListener('input', onInput);
      input.removeEventListener('focus', onFocus);
      input.removeEventListener('blur', onBlur);
      input.removeEventListener('keydown', onKeyDown);
      dropdown.removeEventListener('click', onDropdownClick);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
      hideDropdown(dropdown);
      sessionTokenRef.current = null;
      suggestionsRef.current = [];
    };
  }, [maps, map, enabled, inputRef]);
}
