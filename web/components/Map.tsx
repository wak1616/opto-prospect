'use client';

import { auth, db } from '@/lib/firebase';
import { doc, serverTimestamp, setDoc, getDoc, collection, onSnapshot, query } from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import { Loader } from '@googlemaps/js-api-loader';
import { useSearchParams } from 'next/navigation';

type PlaceResultLite = {
  place_id: string;
  name: string;
  vicinity?: string;
  formatted_address?: string;
  geometry?: google.maps.places.PlaceResult['geometry'];
  rating?: number;
  user_ratings_total?: number;
};

const DEFAULT_RADIUS_MILES = 2;
const MILES_TO_METERS = 1609.34;

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
  const allMarkersRef = useRef<google.maps.Marker[]>([]); // Track ALL markers ever created
  const activeInfoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const [loader] = useState(
    () =>
      new Loader({
        apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
        version: 'weekly',
        libraries: ['places'],
        language: 'en-US',
        region: 'US',
      })
  );

  const [center, setCenter] = useState<google.maps.LatLngLiteral | null>(null);
  const [places, setPlaces] = useState<PlaceResultLite[]>([]);
  const [zip, setZip] = useState('');
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  
  // Track selectedPlaceId changes
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      process.env.NODE_ENV !== 'production' && console.log('selectedPlaceId changed to:', selectedPlaceId);
    }
  }, [selectedPlaceId]);
  
  const [userId, setUserId] = useState<string | null>(null);

  // Track userId changes
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      process.env.NODE_ENV !== 'production' && console.log('userId changed to:', userId);
    }
  }, [userId]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [savedPlaces, setSavedPlaces] = useState<Record<string, { met: boolean; lostCause: boolean }>>({});
  const savedPlacesRef = useRef<Record<string, { met: boolean; lostCause: boolean }>>({});
  const [radiusMiles, setRadiusMiles] = useState(DEFAULT_RADIUS_MILES);
  const [searchOptometrist, setSearchOptometrist] = useState(true);
  const [searchEyeCareCenter, setSearchEyeCareCenter] = useState(true);
  const [hasUserNavigatedAway, setHasUserNavigatedAway] = useState(false);
  const hasUserNavigatedAwayRef = useRef(false);
  const [currentUrlPlaceId, setCurrentUrlPlaceId] = useState<string | null>(null);
  const [hoveredPlaceId, setHoveredPlaceId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const isManualMapClick = useRef(false);
  const searchParams = useSearchParams();

  // Track auth user
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      process.env.NODE_ENV !== 'production' && console.log('Setting up auth state listener');
    }
    const unsub = auth.onAuthStateChanged((u) => {
      if (process.env.NODE_ENV !== 'production') {
        process.env.NODE_ENV !== 'production' && console.log('Auth state changed:', u ? `User logged in: ${u.uid}` : 'User logged out');
      }
      setUserId(u ? u.uid : null);
    });
    return () => unsub();
  }, []);

  // Subscribe to saved places to track their status
  useEffect(() => {
    if (!userId) {
      process.env.NODE_ENV !== 'production' && console.log('No userId, clearing savedPlaces');
      setSavedPlaces({});
      savedPlacesRef.current = {}; // Keep ref in sync
      return;
    }
    
    process.env.NODE_ENV !== 'production' && console.log('Setting up Firebase subscription for userId:', userId);
    const col = collection(db, 'users', userId, 'optometrists');
    const q = query(col);
    const unsub = onSnapshot(q, (snap) => {
      process.env.NODE_ENV !== 'production' && console.log('Firebase snapshot received, size:', snap.size);
      const saved: Record<string, { met: boolean; lostCause: boolean }> = {};
      snap.forEach((doc) => {
        const data = doc.data();
        process.env.NODE_ENV !== 'production' && console.log('Processing saved place:', doc.id, 'lostCause:', data.lostCause);
        saved[doc.id] = {
          met: data.met || false,
          lostCause: data.lostCause || false
        };
      });
      process.env.NODE_ENV !== 'production' && console.log('Setting savedPlaces with', Object.keys(saved).length, 'entries');
      setSavedPlaces(saved);
      savedPlacesRef.current = saved; // Keep ref in sync
    }, (error) => {
      console.error('Firebase subscription error:', error);
    });
    return () => unsub();
  }, [userId]);


  // Initialize map
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loader.load();
      if (!mapRef.current || cancelled) return;

      const defaultCenter = { lat: 28.5383, lng: -81.3792 }; // Orlando, FL (East Coast US)
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
        draggableCursor: 'crosshair',
        draggingCursor: 'url(http://maps.gstatic.com/mapfiles/closedhand_8_8.cur), move',
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
          process.env.NODE_ENV !== 'production' && console.log('Map clicked! selectedPlaceId:', selectedPlaceId, 'coordinates:', e.latLng.lat(), e.latLng.lng());
          
          // Always mark this as a manual click
          process.env.NODE_ENV !== 'production' && console.log('Setting manual click flags');
          setHasUserNavigatedAway(true); // Mark that user has manually navigated away
          hasUserNavigatedAwayRef.current = true; // Also update ref for immediate access
          isManualMapClick.current = true; // Mark this as a manual click
          
          // Clear selected place and reset all markers when clicking new area
          if (selectedPlaceId) {
            process.env.NODE_ENV !== 'production' && console.log('Map clicked - clearing selected place:', selectedPlaceId);
            setSelectedPlaceId(null);
            
            // Reset all markers to red/default style
            Object.values(markersRef.current).forEach((marker) => {
              marker.setIcon({
                url: `https://maps.google.com/mapfiles/ms/icons/red-dot.png`,
              });
              marker.setZIndex(1); // Default z-index
            });
            
            // Close any open info window
            if (activeInfoWindowRef.current) {
              activeInfoWindowRef.current.close();
              activeInfoWindowRef.current = null;
            }
          } else {
            process.env.NODE_ENV !== 'production' && console.log('Map clicked - no selected place to clear, but marking as manual navigation');
          }
          
          // Change cursor to crosshair to indicate selection
          map.setOptions({ draggableCursor: 'crosshair' });
          
          const c = { lat: e.latLng.lat(), lng: e.latLng.lng() };
          setCenter(c);
          map.panTo(c);
          
          // Search nearby and revert cursor after completion
          searchNearby(c, undefined, undefined, isManualMapClick.current).then(() => {
            // Revert cursor back to default hand after search completes
            setTimeout(() => {
              map.setOptions({ draggableCursor: null });
              // Reset the flag after everything is complete, including auto-selection
              isManualMapClick.current = false;
            }, 200); // Longer delay to ensure auto-selection logic has run
          });
        }
      });


    })();

    return () => {
      cancelled = true;
    };
  }, [loader]);

  // Perform nearby search for both optometrist and eye doctor
  
  const searchNearby = async (c: google.maps.LatLngLiteral, targetPlaceId?: string, targetPlace?: any, isFromManualClick = false) => {
    process.env.NODE_ENV !== 'production' && console.log('=== searchNearby called with center:', c, 'targetPlaceId:', targetPlaceId, 'isSearching:', isSearching, 'isFromManualClick:', isFromManualClick);
    const currentMap = mapInstance.current;
    if (!currentMap) {
      process.env.NODE_ENV !== 'production' && console.log('No map instance, returning');
      return;
    }
    
    if (isSearching) {
      process.env.NODE_ENV !== 'production' && console.log('Search already in progress, skipping');
      return;
    }
    
    setIsSearching(true);

    try {
    // Clear old markers and info windows
    process.env.NODE_ENV !== 'production' && console.log('Clearing old markers, tracked count:', Object.keys(markersRef.current).length);
    process.env.NODE_ENV !== 'production' && console.log('Clearing old markers, total count:', allMarkersRef.current.length);
    
    if (activeInfoWindowRef.current) {
      activeInfoWindowRef.current.close();
      activeInfoWindowRef.current = null;
    }
    
    // Clear markers from markersRef first
    Object.values(markersRef.current).forEach((marker, index) => {
      try {
        marker.setMap(null);
        marker.setVisible(false);
        process.env.NODE_ENV !== 'production' && console.log(`Cleared marker ${index} from markersRef`);
      } catch (e) {
        process.env.NODE_ENV !== 'production' && console.warn(`Error clearing marker ${index} from markersRef:`, e);
      }
    });
    
    // Clear ALL markers we've ever created (fallback)
    allMarkersRef.current.forEach((marker, index) => {
      try {
        marker.setMap(null);
        marker.setVisible(false);
        process.env.NODE_ENV !== 'production' && console.log(`Cleared marker ${index} from allMarkersRef`);
      } catch (e) {
        process.env.NODE_ENV !== 'production' && console.warn(`Error clearing marker ${index} from allMarkersRef:`, e);
      }
    });
    
    // Reset all tracking
    markersRef.current = {};
    allMarkersRef.current = [];
    
    // Only clear selected place if this is a manual click or there's no URL place to preserve
    const urlPlaceId = searchParams?.get('placeId');
    if (isFromManualClick || !urlPlaceId) {
      process.env.NODE_ENV !== 'production' && console.log('Clearing selectedPlaceId due to manual click or no URL place');
      setSelectedPlaceId(null);
    } else {
      process.env.NODE_ENV !== 'production' && console.log('Preserving selectedPlaceId for non-manual search with URL place');
    }
    
    // Immediately clear the places state to remove old results from UI
    setPlaces([]);
    
    process.env.NODE_ENV !== 'production' && console.log('After clearing - markersRef count:', Object.keys(markersRef.current).length, 'allMarkersRef count:', allMarkersRef.current.length);

    const service = new google.maps.places.PlacesService(currentMap);
    
    // Build search terms based on user selection
    const searchTerms: string[] = [];
    if (searchOptometrist) searchTerms.push('Optometrist');
    if (searchEyeCareCenter) searchTerms.push('Eye care center');
    
    // If no terms selected, don't search
    if (searchTerms.length === 0) {
      process.env.NODE_ENV !== 'production' && console.log('No search terms selected, skipping search');
      setPlaces([]);
      return;
    }
    const allResults: PlaceResultLite[] = [];
    
    for (const term of searchTerms) {
      const request: google.maps.places.PlaceSearchRequest = {
        location: c,
        radius: radiusMiles * MILES_TO_METERS,
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
            process.env.NODE_ENV !== 'production' && console.warn('Places nearbySearch status:', status);
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

      process.env.NODE_ENV !== 'production' && console.log(`Loaded ${termResults.length} places for "${term}" within ~${radiusMiles} miles.`);
      allResults.push(...termResults);
    }

    // Remove duplicates based on place_id
    let uniqueResults = allResults.filter((place, index, self) => 
      index === self.findIndex(p => p.place_id === place.place_id)
    );

    // If we have a target place that wasn't found in the search, add it manually
    if (targetPlaceId && targetPlace && !uniqueResults.find(p => p.place_id === targetPlaceId)) {
      process.env.NODE_ENV !== 'production' && console.log('Target place not found in search results, adding manually:', targetPlace.name);
      const targetPlaceResult: PlaceResultLite = {
        place_id: targetPlaceId,
        name: targetPlace.name,
        vicinity: targetPlace.address,
        formatted_address: targetPlace.address,
        geometry: targetPlace.lat && targetPlace.lng ? {
          location: new google.maps.LatLng(targetPlace.lat, targetPlace.lng)
        } : undefined,
        rating: targetPlace.rating,
        user_ratings_total: targetPlace.user_ratings_total,
      };
      uniqueResults.unshift(targetPlaceResult); // Add at the beginning
    }

    // Filter out places marked as "Lost Cause" - use ref to get current state
    const currentSavedPlaces = savedPlacesRef.current;
    const filteredResults = uniqueResults.filter(place => {
      const savedPlace = currentSavedPlaces[place.place_id];
      const isLostCause = savedPlace?.lostCause;
      if (isLostCause) {
        process.env.NODE_ENV !== 'production' && console.log(`Filtering out lost cause place: ${place.name} (${place.place_id})`);
      }
      return !isLostCause;
    });

    process.env.NODE_ENV !== 'production' && console.log(`Total unique places found: ${uniqueResults.length}, after filtering lost causes: ${filteredResults.length}`);
    process.env.NODE_ENV !== 'production' && console.log('Current savedPlaces during filtering:', Object.keys(currentSavedPlaces).length, 'entries');
    process.env.NODE_ENV !== 'production' && console.log('SavedPlaces contents:', currentSavedPlaces);
    if (Object.keys(currentSavedPlaces).length > 0) {
      Object.entries(currentSavedPlaces).forEach(([placeId, data]) => {
        process.env.NODE_ENV !== 'production' && console.log(`SavedPlace: ${placeId}, lostCause: ${data.lostCause}, met: ${data.met}`);
      });
    }
    setPlaces(filteredResults);

    // Render all markers (only once, after all searches complete)
    process.env.NODE_ENV !== 'production' && console.log('Creating', filteredResults.length, 'new markers');
    filteredResults.forEach((p) => {
      if (!p.geometry?.location) return;
      const marker = new google.maps.Marker({
        position: p.geometry.location,
        map: currentMap,
        title: p.name,
        icon: {
          url: `https://maps.google.com/mapfiles/ms/icons/red-dot.png`,
        },
        zIndex: 1, // Default z-index for red markers
      });
      const iw = new google.maps.InfoWindow({
        content: `<div style="font-size:14px;"><b>${p.name}</b><br/>${p.vicinity || p.formatted_address || ''}<br/><button id="save-${p.place_id}" class="text-xs border border-gray-300 rounded px-2 py-1 mt-1 cursor-pointer hover:bg-gray-50 text-gray-900 bg-white">Save</button></div>`,
      });
      marker.addListener('click', () => {
        process.env.NODE_ENV !== 'production' && console.log('Marker clicked:', p.place_id, 'Current selected:', selectedPlaceId);
        
        // Close any open info window
        if (activeInfoWindowRef.current) {
          activeInfoWindowRef.current.close();
        }
        
        // Reset ALL markers to red first and lower z-index
        Object.values(markersRef.current).forEach((m) => {
          m.setIcon({
            url: `https://maps.google.com/mapfiles/ms/icons/red-dot.png`,
          });
          m.setZIndex(1); // Default z-index for unselected markers
        });
        
        // Set current selection with higher z-index
        setSelectedPlaceId(p.place_id);
        marker.setIcon({
          url: `https://maps.google.com/mapfiles/ms/icons/green-dot.png`,
        });
        marker.setZIndex(1000); // High z-index for selected marker
        
        // Open new info window and track it
        iw.open({ map: currentMap, anchor: marker });
        activeInfoWindowRef.current = iw;
        
        // Add event listener to Save button after InfoWindow is opened
        setTimeout(() => {
          const saveButton = document.getElementById(`save-${p.place_id}`);
          if (saveButton) {
            saveButton.addEventListener('click', () => {
              savePlace(p);
            });
          }
        }, 100); // Small delay to ensure DOM is ready
      });

      // Add hover functionality to markers
      marker.addListener('mouseover', () => {
        if (selectedPlaceId !== p.place_id) {
          // Only change color if not currently selected
          marker.setIcon({
            url: `https://maps.google.com/mapfiles/ms/icons/green-dot.png`,
          });
          marker.setZIndex(500); // Medium z-index for hovered marker
        }
        // Set hovered state to highlight result card
        setHoveredPlaceId(p.place_id);
      });

      marker.addListener('mouseout', () => {
        if (selectedPlaceId !== p.place_id) {
          // Only revert color if not currently selected
          marker.setIcon({
            url: `https://maps.google.com/mapfiles/ms/icons/red-dot.png`,
          });
          marker.setZIndex(1); // Reset to default z-index
        }
        // Clear hovered state
        setHoveredPlaceId(null);
      });
      markersRef.current[p.place_id] = marker;
      allMarkersRef.current.push(marker); // Track ALL markers
      process.env.NODE_ENV !== 'production' && console.log(`Added marker for ${p.name} (${p.place_id})`);
    });

    process.env.NODE_ENV !== 'production' && console.log('Final marker count in reference:', Object.keys(markersRef.current).length);
    process.env.NODE_ENV !== 'production' && console.log('Final allMarkersRef count:', allMarkersRef.current.length);

    // Focus on place from URL if placeId is present (after search completes)
    // Only do this if user hasn't manually navigated away
    const placeIdFromUrl = searchParams?.get('placeId');
    process.env.NODE_ENV !== 'production' && console.log('Auto-selection check:', {
      placeIdFromUrl,
      hasMarker: placeIdFromUrl ? !!markersRef.current[placeIdFromUrl] : false,
      hasUserNavigatedAway,
      currentUrlPlaceId,
      selectedPlaceId,
      isFromManualClick
    });
    
    if (placeIdFromUrl && markersRef.current[placeIdFromUrl] && !isFromManualClick) {
      process.env.NODE_ENV !== 'production' && console.log('Checking if should auto-select place from URL:', placeIdFromUrl);
      setTimeout(() => {
        // Re-check the ref value at the time of execution (after any state updates from map click)
        process.env.NODE_ENV !== 'production' && console.log('Delayed auto-selection check - hasUserNavigatedAwayRef.current:', hasUserNavigatedAwayRef.current, 'isFromManualClick:', isFromManualClick, 'isManualMapClick.current:', isManualMapClick.current);
        if (!hasUserNavigatedAwayRef.current && !isFromManualClick) {
          process.env.NODE_ENV !== 'production' && console.log('Auto-selecting place from URL:', placeIdFromUrl);
          const marker = markersRef.current[placeIdFromUrl];
          if (marker) {
            // Reset all other markers first
            Object.values(markersRef.current).forEach((m) => {
              if (m !== marker) {
                m.setIcon({ url: `https://maps.google.com/mapfiles/ms/icons/red-dot.png` });
                m.setZIndex(1);
              }
            });
            
            process.env.NODE_ENV !== 'production' && console.log('Setting selectedPlaceId to:', placeIdFromUrl);
            setSelectedPlaceId(placeIdFromUrl);
            marker.setIcon({ url: `https://maps.google.com/mapfiles/ms/icons/green-dot.png` });
            marker.setZIndex(1000); // High z-index for selected marker
            mapInstance.current?.panTo(marker.getPosition()!);
          }
        } else {
          process.env.NODE_ENV !== 'production' && console.log('Skipping auto-selection - user has navigated away');
        }
      }, 100); // Small delay to ensure marker is ready and state is updated
    } else {
      process.env.NODE_ENV !== 'production' && console.log('Skipping auto-selection - no placeId, marker not found, or manual click');
    }
    
    } catch (error) {
      console.error('Error in searchNearby:', error);
    } finally {
      setIsSearching(false);
      process.env.NODE_ENV !== 'production' && console.log('=== searchNearby completed');
    }
  };

  // Handle placeId from URL parameter - center map at saved place location
  useEffect(() => {
    const placeIdFromUrl = searchParams?.get('placeId');
    process.env.NODE_ENV !== 'production' && console.log('=== placeId Effect triggered ===');
    process.env.NODE_ENV !== 'production' && console.log('URL placeId parameter:', placeIdFromUrl, 'userId:', userId, 'hasUserNavigatedAway:', hasUserNavigatedAway);
    process.env.NODE_ENV !== 'production' && console.log('Current tracked placeId:', currentUrlPlaceId);
    process.env.NODE_ENV !== 'production' && console.log('Current URL:', window.location.href);
    
    if (!placeIdFromUrl) {
      process.env.NODE_ENV !== 'production' && console.log('No placeId in URL, returning');
      // Reset states when there's no placeId in URL
      setHasUserNavigatedAway(false);
      hasUserNavigatedAwayRef.current = false;
      setCurrentUrlPlaceId(null);
      return;
    }
    
    if (!userId) {
      process.env.NODE_ENV !== 'production' && console.log('No userId available, returning');
      return;
    }
    
    // Check if this is a new placeId (new "View on Map" click)
    if (placeIdFromUrl !== currentUrlPlaceId) {
      process.env.NODE_ENV !== 'production' && console.log('New placeId detected, resetting navigation state. Old:', currentUrlPlaceId, 'New:', placeIdFromUrl);
      setHasUserNavigatedAway(false);
      hasUserNavigatedAwayRef.current = false;
      setCurrentUrlPlaceId(placeIdFromUrl);
    } else {
      process.env.NODE_ENV !== 'production' && console.log('Same placeId as before, keeping current navigation state');
    }
    
    if (hasUserNavigatedAway) {
      process.env.NODE_ENV !== 'production' && console.log('User has navigated away from URL place, not re-centering');
      return;
    }

    const fetchSavedPlace = async () => {
      try {
        const docRef = doc(db, 'users', userId, 'optometrists', placeIdFromUrl);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const savedPlace = docSnap.data();
          process.env.NODE_ENV !== 'production' && console.log('Fetched saved place:', savedPlace);
          
          if (savedPlace.lat != null && savedPlace.lng != null) {
            // Use saved coordinates
            const placeCenter = { lat: savedPlace.lat, lng: savedPlace.lng };
            process.env.NODE_ENV !== 'production' && console.log('Centering map at saved coordinates:', placeCenter);
            setCenter(placeCenter);
            if (mapInstance.current) {
              mapInstance.current.setCenter(placeCenter);
              mapInstance.current.setZoom(15);
            }
            // Manually trigger search after centering, including the target place
            setTimeout(() => searchNearby(placeCenter, placeIdFromUrl, savedPlace, false), 500); // Allow auto-selection for URL navigation
          } else if (savedPlace.address && mapInstance.current) {
            // Fallback: geocode the address
            process.env.NODE_ENV !== 'production' && console.log('No coordinates found, geocoding address:', savedPlace.address);
            const geocoder = new google.maps.Geocoder();
            geocoder.geocode({ address: savedPlace.address }, (results, status) => {
              if (status === 'OK' && results?.[0]?.geometry?.location) {
                const loc = results[0].geometry.location;
                const placeCenter = { lat: loc.lat(), lng: loc.lng() };
                process.env.NODE_ENV !== 'production' && console.log('Centering map at geocoded location:', placeCenter);
                setCenter(placeCenter);
                if (mapInstance.current) {
                  mapInstance.current.setCenter(placeCenter);
                  mapInstance.current.setZoom(15);
                }
                // Manually trigger search after geocoding, including the target place
                setTimeout(() => searchNearby(placeCenter, placeIdFromUrl, savedPlace, false), 500); // Allow auto-selection for URL navigation
              } else {
                console.error('Geocoding failed:', status);
              }
            });
          } else {
            process.env.NODE_ENV !== 'production' && console.warn('Saved place has no coordinates or address:', savedPlace);
          }
        } else {
          process.env.NODE_ENV !== 'production' && console.warn('No saved place found for placeId:', placeIdFromUrl);
        }
      } catch (error) {
        console.error('Error fetching saved place:', error);
      }
    };

    fetchSavedPlace();
  }, [searchParams, userId]);

  // Re-search when radius or search terms change (if we have a center and there are current results)
  useEffect(() => {
    if (center && places.length > 0) {
      process.env.NODE_ENV !== 'production' && console.log('Search parameters changed, re-searching...');
      searchNearby(center, undefined, undefined, false); // Not a manual click
    }
  }, [radiusMiles, searchOptometrist, searchEyeCareCenter]);

  // Re-filter and update display when savedPlaces changes (e.g., when lost cause status changes)
  useEffect(() => {
    if (places.length > 0) {
      process.env.NODE_ENV !== 'production' && console.log('Saved places updated, re-filtering results...');
      process.env.NODE_ENV !== 'production' && console.log('Current savedPlaces:', Object.keys(savedPlaces).length, 'entries');
      Object.entries(savedPlaces).forEach(([placeId, data]) => {
        if (data.lostCause) {
          process.env.NODE_ENV !== 'production' && console.log(`Lost cause place in savedPlaces: ${placeId}`);
        }
      });
      // Re-filter the current places based on updated savedPlaces
      const currentSavedPlaces = savedPlacesRef.current;
      const filteredResults = places.filter(place => {
        const savedPlace = currentSavedPlaces[place.place_id];
        const isLostCause = savedPlace?.lostCause;
        if (isLostCause) {
          process.env.NODE_ENV !== 'production' && console.log(`Real-time filtering out lost cause place: ${place.name} (${place.place_id})`);
        }
        return !isLostCause;
      });
      
      // If the filtered results differ from current places, update
      if (filteredResults.length !== places.length) {
        process.env.NODE_ENV !== 'production' && console.log(`Filtering results: ${places.length} -> ${filteredResults.length} places`);
        
        // Clear existing markers for places that are now lost causes
        places.forEach(place => {
          const savedPlace = savedPlaces[place.place_id];
          if (savedPlace?.lostCause && markersRef.current[place.place_id]) {
            markersRef.current[place.place_id].setMap(null);
            delete markersRef.current[place.place_id];
          }
        });
        
        setPlaces(filteredResults);
      }
    }
  }, [savedPlaces]);

  // No automatic search on initial load - only search on manual actions
  // Searches are triggered by:
  // 1. Manual map clicks (in map click handler)
  // 2. "View on Map" navigation (in placeId URL handler)  
  // 3. ZIP lookup (in geocodeZip function)
  // 4. "Use my location" (in handleRecenter function)
  // 5. Radius changes (if already have results)

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
        searchNearby(c, undefined, undefined, false); // Not a manual click
      }
    });
  };

  const handleRecenter = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setCenter(c);
      mapInstance.current?.setCenter(c);
              searchNearby(c, undefined, undefined, false); // Not a manual click
    });
  };

  const savePlace = async (p: PlaceResultLite) => {
    if (!userId) {
      alert('Please sign in with Google to save.');
      return;
    }
    
    let phone: string | null = null;
    
    // Get detailed place information including phone number
    if (mapInstance.current) {
      const service = new google.maps.places.PlacesService(mapInstance.current);
      
      try {
        const details = await new Promise<google.maps.places.PlaceResult | null>((resolve) => {
          service.getDetails(
            {
              placeId: p.place_id,
              fields: ['formatted_phone_number', 'international_phone_number']
            },
            (result, status) => {
              if (status === google.maps.places.PlacesServiceStatus.OK && result) {
                resolve(result);
              } else {
                process.env.NODE_ENV !== 'production' && console.warn('Failed to get place details for phone number:', status);
                resolve(null);
              }
            }
          );
        });
        
        if (details) {
          phone = details.formatted_phone_number || details.international_phone_number || null;
        }
      } catch (error) {
        process.env.NODE_ENV !== 'production' && console.warn('Error getting place details:', error);
      }
    }
    
    const address = p.vicinity || p.formatted_address || '';
    const lat = p.geometry?.location ? p.geometry.location.lat() : null;
    const lng = p.geometry?.location ? p.geometry.location.lng() : null;

    const data = {
      name: p.name,
      address,
      lat,
      lng,
      rating: p.rating ?? null,
      user_ratings_total: p.user_ratings_total ?? null,
      phone,
      met: false,
      lostCause: false,
      notes: '',
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    };

    const ref = doc(db, 'users', userId, 'optometrists', p.place_id);
    await setDoc(ref, data, { merge: true }); // idempotent by place_id
    
    // Show toast notification
    setToastMessage(`Saved: ${p.name}`);
    setTimeout(() => setToastMessage(null), 3000); // Auto-hide after 3 seconds
  };

  const getDirections = (p: PlaceResultLite) => {
    const lat = p.geometry?.location ? p.geometry.location.lat() : null;
    const lng = p.geometry?.location ? p.geometry.location.lng() : null;
    const address = p.vicinity || p.formatted_address || '';
    
    if (lat != null && lng != null) {
      // Use Google Maps Directions; current location is implicit
      const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
      window.open(url, '_blank');
    } else if (address) {
      const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
      window.open(url, '_blank');
    } else {
      alert('No coordinates or address available for directions.');
    }
  };

  return (
    <div className="h-[100dvh] w-full relative">
      {/* Controls */}
      <div className="absolute top-4 left-4 z-10 flex flex-wrap gap-2 bg-white/90 p-3 rounded-2xl shadow">
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

        <div className="flex items-center gap-2">
          <label htmlFor="radius-select" className="text-sm text-gray-600">Search radius:</label>
          <select
            id="radius-select"
            value={radiusMiles}
            onChange={(e) => setRadiusMiles(Number(e.target.value))}
            className="border rounded-lg px-2 py-1 text-sm bg-white"
          >
            <option value={1}>1 mile</option>
            <option value={2}>2 miles</option>
            <option value={3}>3 miles</option>
            <option value={5}>5 miles</option>
            <option value={10}>10 miles</option>
          </select>
        </div>

        <div className="flex items-center gap-3 bg-gray-50/80 rounded-lg px-3 py-2">
          <span className="text-sm text-gray-700 font-medium">Search for:</span>
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={searchOptometrist}
              onChange={(e) => setSearchOptometrist(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">Optometrist</span>
          </label>
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={searchEyeCareCenter}
              onChange={(e) => setSearchEyeCareCenter(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">Eye care center</span>
          </label>
        </div>
      </div>

      {/* Results panel */}
      <div className="absolute left-4 top-32 z-10 bg-white/95 max-h-[65vh] w-80 overflow-auto rounded-2xl shadow p-3">
        <div className="font-semibold mb-2">Results ({places.length})</div>
        {places.length === 0 && <div className="text-sm text-gray-600">No results yet.</div>}
        <ul className="space-y-2">
          {places.map((p) => {
            const saved = savedPlaces[p.place_id];
            const isSelected = selectedPlaceId === p.place_id;
            const isHovered = hoveredPlaceId === p.place_id;
            const isLostCause = saved?.lostCause;
            const isSavedAndMet = saved?.met && !isLostCause;
            
            let className = 'border rounded-lg p-2 transition-all duration-200 ease-in-out ';
            if (isSelected) {
              className += 'border-green-500 bg-green-50';
            } else if (isHovered) {
              className += 'border-green-400 bg-green-50/50 shadow-lg scale-[1.02] z-10 relative';
            } else if (isLostCause) {
              className += 'border-red-500 bg-red-50 opacity-75';
            } else if (isSavedAndMet) {
              className += 'bg-gray-100 border-gray-300';
            }
            
            return (
            <li 
              key={p.place_id} 
              className={`${className} cursor-pointer relative ${!isHovered && !isSelected ? 'hover:shadow-lg hover:scale-[1.02] hover:border-green-400 hover:bg-green-50/50 hover:z-10' : ''}`}
              onMouseEnter={() => {
                // Only handle card hover if not already hovered from marker
                if (hoveredPlaceId !== p.place_id) {
                  // Delay marker highlight to sync with card transition
                  setTimeout(() => {
                    const marker = markersRef.current[p.place_id];
                    if (marker && selectedPlaceId !== p.place_id) {
                      marker.setIcon({
                        url: `https://maps.google.com/mapfiles/ms/icons/green-dot.png`,
                      });
                      marker.setZIndex(500); // Medium z-index for hovered marker
                    }
                  }, 50); // Small delay to start with card animation
                  setHoveredPlaceId(p.place_id);
                }
              }}
              onMouseLeave={() => {
                // Only handle card hover leave if this card initiated the hover
                if (hoveredPlaceId === p.place_id) {
                  // Delay marker reset to sync with card transition
                  setTimeout(() => {
                    const marker = markersRef.current[p.place_id];
                    if (marker && selectedPlaceId !== p.place_id) {
                      marker.setIcon({
                        url: `https://maps.google.com/mapfiles/ms/icons/red-dot.png`,
                      });
                      marker.setZIndex(1); // Reset to default z-index
                    }
                  }, 150); // Slightly longer delay for smooth exit feel
                  setHoveredPlaceId(null);
                }
              }}
              onClick={() => {
                if (p.geometry?.location && mapInstance.current) {
                  process.env.NODE_ENV !== 'production' && console.log('Card clicked, recentering on:', p.name);
                  
                  // Close any open info window
                  if (activeInfoWindowRef.current) {
                    activeInfoWindowRef.current.close();
                  }
                  
                  // Reset ALL markers to red first and lower z-index
                  Object.values(markersRef.current).forEach((m) => {
                    m.setIcon({
                      url: `https://maps.google.com/mapfiles/ms/icons/red-dot.png`,
                    });
                    m.setZIndex(1); // Default z-index for unselected markers
                  });
                  
                  // Set current selection with higher z-index
                  setSelectedPlaceId(p.place_id);
                  const currentMarker = markersRef.current[p.place_id];
                  if (currentMarker) {
                    currentMarker.setIcon({
                      url: `https://maps.google.com/mapfiles/ms/icons/green-dot.png`,
                    });
                    currentMarker.setZIndex(1000); // High z-index for selected marker
                  }
                  
                  // Recenter the map on this location
                  mapInstance.current.panTo(p.geometry.location);
                }
              }}
            >
              <div className="text-sm font-medium">{p.name}</div>
              <div className="text-xs text-gray-600">{p.vicinity || p.formatted_address}</div>
              {renderStarRating(p.rating, p.user_ratings_total)}
              <div className="mt-2 flex gap-2">
                <button
                  className="text-xs border rounded px-2 py-1"
                  onClick={(e) => {
                    e.stopPropagation(); // Prevent card click
                    if (p.geometry?.location && mapInstance.current) {
                      process.env.NODE_ENV !== 'production' && console.log('View on map clicked:', p.place_id);
                      
                      // Reset ALL markers to red first and lower z-index
                      Object.values(markersRef.current).forEach((m) => {
                        m.setIcon({
                          url: `https://maps.google.com/mapfiles/ms/icons/red-dot.png`,
                        });
                        m.setZIndex(1); // Default z-index for unselected markers
                      });
                      
                      // Set current selection with higher z-index
                      setSelectedPlaceId(p.place_id);
                      const currentMarker = markersRef.current[p.place_id];
                      if (currentMarker) {
                        currentMarker.setIcon({
                          url: `https://maps.google.com/mapfiles/ms/icons/green-dot.png`,
                        });
                        currentMarker.setZIndex(1000); // High z-index for selected marker
                      }
                      
                      mapInstance.current.panTo(p.geometry.location);
                    }
                  }}
                >
                  View on map
                </button>
                <button
                  className="text-xs border rounded px-2 py-1"
                  onClick={(e) => {
                    e.stopPropagation(); // Prevent card click
                    getDirections(p);
                  }}
                >
                  Directions
                </button>
                <button
                  className="text-xs border rounded px-2 py-1"
                  onClick={(e) => {
                    e.stopPropagation(); // Prevent card click
                    savePlace(p);
                  }}
                >
                  Save
                </button>
              </div>
            </li>
            );
          })}
        </ul>
      </div>

      {/* Map canvas */}
      <div ref={mapRef} className="h-full w-full rounded-none" />
      
      {/* Toast notification */}
      {toastMessage && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg transition-all duration-300 ease-in-out">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-green-200" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            {toastMessage}
          </div>
        </div>
      )}
    </div>
  );
}