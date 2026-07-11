import { useEffect, useRef } from 'react';
import { PLACES_COUNTRY } from '../constants/mapDefaults';
import { MAPS_SETUP_HELP } from './useGoogleMap';
import { forwardGeocode } from '../utils/geocoding';
import { debounce } from '../utils/debounce';

const DROPDOWN_CLASS = 'place-search-dropdown';
const DEBOUNCE_MS = 450;
const MIN_QUERY_LENGTH = 3;
const SCROLL_DEBOUNCE_MS = 80;

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

function placeFromGeocode(point) {
  if (!point) return null;
  return {
    lat: point.lat,
    lng: point.lng,
    name: point.address,
    address: point.address,
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

function isPlacesNewDisabledError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  return (
    msg.includes('places api (new)') ||
    msg.includes('places.googleapis.com') ||
    msg.includes('has not been used') ||
    msg.includes('is disabled')
  );
}

function formatSearchError(err) {
  if (isPlacesNewDisabledError(err)) {
    return `Place suggestions need <strong>Places API (New)</strong> enabled in Google Cloud for this API key. ${MAPS_SETUP_HELP}`;
  }
  return err?.message || 'Could not load suggestions';
}

/**
 * Places Autocomplete (New) + Geocoding fallback + text search on Enter.
 */
export function useMapPlaceSearch(inputRef, { maps, map, enabled, onSelect }) {
  const onSelectRef = useRef(onSelect);
  const sessionTokenRef = useRef(null);
  const dropdownRef = useRef(null);
  const suggestionsRef = useRef([]);
  const activeIndexRef = useRef(-1);
  const requestIdRef = useRef(0);
  const placesUnavailableRef = useRef(false);

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
      if (placesUnavailableRef.current) {
        return placeFromGeocode(
          await forwardGeocode(maps, query, {
            componentRestrictions: { country: PLACES_COUNTRY },
          }),
        );
      }

      const { Place } = await window.google.maps.importLibrary('places');
      const { places } = await Place.searchByText({
        textQuery: query,
        fields: ['location', 'displayName', 'formattedAddress'],
        region: PLACES_COUNTRY,
        maxResultCount: 1,
      });
      const place = places?.[0];
      if (!place) {
        return placeFromGeocode(
          await forwardGeocode(maps, query, {
            componentRestrictions: { country: PLACES_COUNTRY },
          }),
        );
      }
      await place.fetchFields({
        fields: ['location', 'displayName', 'formattedAddress'],
      });
      return placeFromFields(place);
    };

    const showMessage = (html, isError = false) => {
      positionDropdown(dropdown, input);
      dropdown.style.display = 'block';
      dropdown.innerHTML = `<div class="${isError ? 'place-search-error' : 'place-search-hint'}">${html}</div>`;
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
          if (prediction._isGeocodeFallback) {
            const active = index === activeIndexRef.current ? ' is-active' : '';
            return `<button type="button" class="place-search-item${active}" data-index="${index}" role="option">
              <span class="place-search-item-main">${prediction.label}</span>
              <span class="place-search-item-sub">Geocoding result</span>
            </button>`;
          }
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

    const fetchGeocodeSuggestions = async (trimmed, requestId) => {
      const point = await forwardGeocode(maps, trimmed, {
        componentRestrictions: { country: PLACES_COUNTRY },
      });
      if (cancelled || requestId !== requestIdRef.current) return;
      if (!point) {
        showMessage('No results found for this search.', true);
        return;
      }
      suggestionsRef.current = [
        {
          _isGeocodeFallback: true,
          label: point.address,
          point,
        },
      ];
      activeIndexRef.current = -1;
      renderSuggestions();
    };

    const fetchSuggestions = async (value) => {
      const trimmed = value?.trim();
      if (!trimmed) {
        suggestionsRef.current = [];
        hideDropdown(dropdown);
        return;
      }

      if (trimmed.length < MIN_QUERY_LENGTH) {
        showMessage(`Type at least ${MIN_QUERY_LENGTH} characters to search.`);
        return;
      }

      const requestId = ++requestIdRef.current;

      if (placesUnavailableRef.current) {
        await fetchGeocodeSuggestions(trimmed, requestId);
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

        if (cancelled || requestId !== requestIdRef.current) return;

        suggestionsRef.current = suggestions
          .map((s) => s.placePrediction)
          .filter(Boolean)
          .slice(0, 6);
        activeIndexRef.current = -1;

        if (!suggestionsRef.current.length) {
          await fetchGeocodeSuggestions(trimmed, requestId);
          return;
        }

        renderSuggestions();
      } catch (err) {
        if (cancelled || requestId !== requestIdRef.current) return;

        if (isPlacesNewDisabledError(err)) {
          placesUnavailableRef.current = true;
          console.warn('[Places API (New)] disabled — falling back to Geocoding API.', err);
          try {
            await fetchGeocodeSuggestions(trimmed, requestId);
            return;
          } catch (geoErr) {
            console.error('[Geocoding API]', geoErr);
          }
        } else {
          console.error('[Places API (New)]', err);
        }

        showMessage(formatSearchError(err), true);
        suggestionsRef.current = [];
      }
    };

    const debouncedFetch = debounce((value) => {
      fetchSuggestions(value);
    }, DEBOUNCE_MS);

    const onInput = () => {
      debouncedFetch(input.value);
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
          if (picked._isGeocodeFallback) {
            selectPlace(placeFromGeocode(picked.point));
          } else {
            selectPlace(await resolvePrediction(picked));
          }
        } catch (err) {
          console.error('[Places API (New)]', err);
          showMessage(formatSearchError(err), true);
        }
        return;
      }

      const query = input.value?.trim();
      if (!query || query.length < MIN_QUERY_LENGTH) return;
      try {
        selectPlace(await searchByText(query));
      } catch (err) {
        console.error('[Place search]', err);
        showMessage(formatSearchError(err), true);
      }
    };

    const onDropdownClick = async (e) => {
      const btn = e.target.closest('.place-search-item');
      if (!btn) return;
      const index = Number(btn.dataset.index);
      const prediction = suggestionsRef.current[index];
      if (!prediction) return;
      try {
        if (prediction._isGeocodeFallback) {
          selectPlace(placeFromGeocode(prediction.point));
        } else {
          selectPlace(await resolvePrediction(prediction));
        }
      } catch (err) {
        console.error('[Places API (New)]', err);
        showMessage(formatSearchError(err), true);
      }
    };

    const repositionDropdown = debounce(() => {
      if (dropdown.style.display === 'block') positionDropdown(dropdown, input);
    }, SCROLL_DEBOUNCE_MS);

    input.addEventListener('input', onInput);
    input.addEventListener('focus', onFocus);
    input.addEventListener('blur', onBlur);
    input.addEventListener('keydown', onKeyDown);
    dropdown.addEventListener('mousedown', (e) => e.preventDefault());
    dropdown.addEventListener('click', onDropdownClick);
    window.addEventListener('scroll', repositionDropdown, true);
    window.addEventListener('resize', repositionDropdown);

    return () => {
      cancelled = true;
      requestIdRef.current += 1;
      debouncedFetch.cancel();
      repositionDropdown.cancel();
      input.removeEventListener('input', onInput);
      input.removeEventListener('focus', onFocus);
      input.removeEventListener('blur', onBlur);
      input.removeEventListener('keydown', onKeyDown);
      dropdown.removeEventListener('click', onDropdownClick);
      window.removeEventListener('scroll', repositionDropdown, true);
      window.removeEventListener('resize', repositionDropdown);
      hideDropdown(dropdown);
      sessionTokenRef.current = null;
      suggestionsRef.current = [];
      placesUnavailableRef.current = false;
    };
  }, [maps, map, enabled, inputRef]);
}
