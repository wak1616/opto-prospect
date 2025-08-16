'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader } from '@googlemaps/js-api-loader';

type PlaceResultLite = {
  place_id: string;
  name: string;
  vicinity?: string;
  formatted_address?: string;
  geometry?: google.maps.places.PlaceResult['geometry'];
  rating?: number;
  user_ratings_total?: number;
};

const RADIUS_METERS = 4828.03; // ~3 miles

// Helper function to render star rating
const renderStarRating = (rating?: number, totalReviews?: number) => {
  if (!rating) return null;
  
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating % 1 >= 0.5;
  const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
  
  return (
    <div className="flex items-center gap-1 text-xs">
      <div className="flex">
        {/* Full stars */}
        {Array(fullStars).fill(0).map((_, i) => (
          <span key={`full-${i}`} className="text-yellow-400">★</span>
        ))}
        {/* Half star */}
        {hasHalfStar && <span className="text-yellow-400">☆</span>}
        {/* Empty stars */}
        {Array(emptyStars).fill(0).map((_, i) => (
          <span key={`empty-${i}`} className="text-gray-300">☆</span>
        ))}
      </div>
      <span className="text-gray-600">
        {rating.toFixed(1)} {totalReviews ? `(${totalReviews})` : ''}
      </span>
    </div>
  );
};

export default function Map() {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<{ [key: string]: google.maps.Marker }>({});
  const activeInfoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const [loader] = useState(
    () =>
      new Loader({
        apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
        version: 'weekly',
        libraries: ['places'],
      })
  );

  const [center, setCenter] = useState<google.maps.LatLngLiteral | null>(null);
  const [places, setPlaces] = useState<PlaceResultLite[]>([]);
  const [zip, setZip] = useState('');
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);

  // Initialize map
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loader.load();
      if (!mapRef.current || cancelled) return;

      const defaultCenter = { lat: 27.3364, lng: -82.5307 }; // Sarasota fallback
      const map = new google.maps.Map(mapRef.current, {
        center: defaultCenter,
        zoom: 15,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        scaleControl: true,
        scaleControlOptions: {
          style: google.maps.ScaleControlStyle.DEFAULT,
        },
      });
      mapInstance.current = map;

      // Try geolocation
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            setCenter(c);
            map.setCenter(c);
          },
          () => {
            setCenter(defaultCenter);
            map.setCenter(defaultCenter);
          }
        );
      } else {
        setCenter(defaultCenter);
        map.setCenter(defaultCenter);
      }

      // Click to re-center and search
      map.addListener('click', (e: google.maps.MapMouseEvent) => {
        if (e.latLng) {
          const c = { lat: e.latLng.lat(), lng: e.latLng.lng() };
          setCenter(c);
          map.panTo(c);
          searchNearby(c);
        }
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [loader]);

  // Perform nearby search for both optometrist and eye doctor
  
  const searchNearby = async (c: google.maps.LatLngLiteral) => {
    const map = mapInstance.current;
    if (!map) return;

    // Clear old markers and info windows
    if (activeInfoWindowRef.current) {
      activeInfoWindowRef.current.close();
      activeInfoWindowRef.current = null;
    }
    Object.values(markersRef.current).forEach((marker) => marker.setMap(null));
    markersRef.current = {};
    setSelectedPlaceId(null);

    const service = new google.maps.places.PlacesService(map);
    
    // Search for both "optometrist" and "eye doctor" terms
    const searchTerms = ['optometrist', 'eye doctor'];
    const allResults: PlaceResultLite[] = [];
    
    for (const term of searchTerms) {
      const bounds = map.getBounds();
      const request: google.maps.places.PlaceSearchRequest = {
        bounds: bounds || undefined,
        // IMPORTANT: use keyword only; drop "type" to avoid over-filtering
        keyword: term,
        // openNow: false, // omit for broader results
      };

      // Collect ALL pages for this term
      const termResults: PlaceResultLite[] = [];
      await new Promise<void>((resolve) => {
        const handle = (
          results: google.maps.places.PlaceResult[] | null,
          status: google.maps.places.PlacesServiceStatus,
          pagination: google.maps.places.PlaceSearchPagination | null
        ) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && results) {
            for (const r of results) {
              if (!r.place_id) continue;
              termResults.push({
                place_id: r.place_id,
                name: r.name || 'Unknown',
                vicinity: r.vicinity,
                formatted_address: r.formatted_address,
                geometry: r.geometry,
                rating: r.rating,
                user_ratings_total: r.user_ratings_total,
              });
            }
          } else if (status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
            // no results in this area
            console.info('ZERO_RESULTS for', term, 'around', c);
          } else {
            console.warn('Places nearbySearch status:', status);
          }
          
          if (pagination && pagination.hasNextPage) {
            // Required small delay before nextPage()
            setTimeout(() => {
              try {
                pagination.nextPage();
              } catch (e) {
                console.error('pagination.nextPage() failed:', e);
                resolve();
              }
            }, 1500);
          } else {
            resolve();
          }
        };
        service.nearbySearch(request, handle);
      });

      console.log(`Loaded ${termResults.length} places for "${term}" within ~3 miles.`);
      allResults.push(...termResults);
    }

    // Remove duplicates based on place_id
    const uniqueResults = allResults.filter((place, index, self) => 
      index === self.findIndex(p => p.place_id === place.place_id)
    );

    console.log(`Total unique places found: ${uniqueResults.length}`);
    setPlaces(uniqueResults);

    // Render all markers
    uniqueResults.forEach((p) => {
      if (!p.geometry?.location) return;
      const marker = new google.maps.Marker({
        position: p.geometry.location,
        map,
        title: p.name,
        icon: {
          url: `https://maps.google.com/mapfiles/ms/icons/red-dot.png`,
        },
      });
      const iw = new google.maps.InfoWindow({
        content: `<div style="font-size:14px;"><b>${p.name}</b><br/>${p.vicinity || p.formatted_address || ''}<br/><button id="save-${p.place_id}" style="margin-top:6px;">Save</button></div>`,
      });
      marker.addListener('click', () => {
        console.log('Marker clicked:', p.place_id, 'Current selected:', selectedPlaceId);
        
        // Close any open info window
        if (activeInfoWindowRef.current) {
          activeInfoWindowRef.current.close();
        }
        
        // Reset ALL markers to red first
        Object.values(markersRef.current).forEach((m) => {
          m.setIcon({
            url: `https://maps.google.com/mapfiles/ms/icons/red-dot.png`,
          });
        });
        
        // Set current selection
        setSelectedPlaceId(p.place_id);
        marker.setIcon({
          url: `https://maps.google.com/mapfiles/ms/icons/green-dot.png`,
        });
        
        // Open new info window and track it
        iw.open({ map, anchor: marker });
        activeInfoWindowRef.current = iw;
      });
      markersRef.current[p.place_id] = marker;
    });
  };

  // Initial search once we have center
  useEffect(() => {
    if (center) searchNearby(center);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center]);

  // ZIP lookup
  const geocodeZip = async () => {
    const map = mapInstance.current;
    if (!map || !zip) return;
    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ address: zip }, (results, status) => {
      if (status === 'OK' && results?.[0]?.geometry?.location) {
        const loc = results[0].geometry.location;
        const c = { lat: loc.lat(), lng: loc.lng() };
        setCenter(c);
        map.setCenter(c);
        searchNearby(c);
      }
    });
  };

  const handleRecenter = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setCenter(c);
      mapInstance.current?.setCenter(c);
              searchNearby(c);
    });
  };

  return (
    <div className="h-[100dvh] w-full relative">
      {/* Controls */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex flex-wrap gap-2 bg-white/90 p-3 rounded-2xl shadow">
        <input
          value={zip}
          onChange={(e) => setZip(e.target.value)}
          placeholder="ZIP code"
          className="border rounded-lg px-3 py-2 w-36"
          aria-label="ZIP code"
        />
        <button onClick={geocodeZip} className="border rounded-lg px-3 py-2 hover:bg-gray-50">
          Use zip code
        </button>

        <button onClick={handleRecenter} className="border rounded-lg px-3 py-2 hover:bg-gray-50">
          Use my location
        </button>

        <div className="text-sm text-gray-600 self-center px-2">Searching: optometrist + eye doctor (visible area)</div>
      </div>

      {/* Results panel */}
      <div className="absolute left-4 top-24 z-10 bg-white/95 max-h-[70vh] w-80 overflow-auto rounded-2xl shadow p-3">
        <div className="font-semibold mb-2">Results ({places.length})</div>
        {places.length === 0 && <div className="text-sm text-gray-600">No results yet.</div>}
        <ul className="space-y-2">
          {places.map((p) => (
            <li key={p.place_id} className={`border rounded-lg p-2 ${selectedPlaceId === p.place_id ? 'border-green-500 bg-green-50' : ''}`}>
              <div className="text-sm font-medium">{p.name}</div>
              <div className="text-xs text-gray-600">{p.vicinity || p.formatted_address}</div>
              {renderStarRating(p.rating, p.user_ratings_total)}
              <div className="mt-2 flex gap-2">
                <button
                  className="text-xs border rounded px-2 py-1"
                  onClick={() => {
                    if (p.geometry?.location && mapInstance.current) {
                      console.log('View on map clicked:', p.place_id);
                      
                      // Reset ALL markers to red first
                      Object.values(markersRef.current).forEach((m) => {
                        m.setIcon({
                          url: `https://maps.google.com/mapfiles/ms/icons/red-dot.png`,
                        });
                      });
                      
                      // Set current selection
                      setSelectedPlaceId(p.place_id);
                      const currentMarker = markersRef.current[p.place_id];
                      if (currentMarker) {
                        currentMarker.setIcon({
                          url: `https://maps.google.com/mapfiles/ms/icons/green-dot.png`,
                        });
                      }
                      
                      mapInstance.current.panTo(p.geometry.location);
                    }
                  }}
                >
                  View on map
                </button>
                <button
                  className="text-xs border rounded px-2 py-1"
                  onClick={() => {
                    // placeholder: will connect to Firestore next step
                    alert(`(Coming soon) Save ${p.name}`);
                  }}
                >
                  Save
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Map canvas */}
      <div ref={mapRef} className="h-full w-full rounded-none" />
    </div>
  );
}