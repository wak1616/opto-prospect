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

type TargetPlaceFromSaved = {
  name: string;
  address?: string;
  lat?: number | null;
  lng?: number | null;
  rating?: number | null;
  user_ratings_total?: number | null;
};

const DEFAULT_RADIUS_MILES = 3;
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
      console.log('selectedPlaceId changed to:', selectedPlaceId);
    }
  }, [selectedPlaceId]);
  
  const [userId, setUserId] = useState<string | null>(null);

  // Track userId changes
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      console.log('userId changed to:', userId);
    }
  }, [userId]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [savedPlaces, setSavedPlaces] = useState<Record<string, { met: boolean; lostCause: boolean }>>({});
  const savedPlacesRef = useRef<Record<string, { met: boolean; lostCause: boolean }>>({});
  const [radiusMiles, setRadiusMiles] = useState(DEFAULT_RADIUS_MILES);
  
  // Add new state for mobile responsiveness
  const [isResultsCollapsed, setIsResultsCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isMobileControlsCollapsed, setIsMobileControlsCollapsed] = useState(false);
  // Responsive: collapse the lower filters row (radius + search for) by default on mobile, expanded on desktop
  const [areLowerFiltersCollapsed, setAreLowerFiltersCollapsed] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 1024 : true
  );
  const [searchOptometrist, setSearchOptometrist] = useState(true);
  const [searchEyeCareCenter, setSearchEyeCareCenter] = useState(true);
  const [hasUserNavigatedAway, setHasUserNavigatedAway] = useState(false);
  const hasUserNavigatedAwayRef = useRef(false);
  const [currentUrlPlaceId, setCurrentUrlPlaceId] = useState<string | null>(null);
  const [hoveredPlaceId, setHoveredPlaceId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [selectedControl, setSelectedControl] = useState<'zip' | 'location' | null>(null);
  const [showWelcomeNotification, setShowWelcomeNotification] = useState(true);
  const isManualMapClick = useRef(false);
  const searchParams = useSearchParams();

  // Track auth user
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      console.log('Setting up auth state listener');
    }
    const unsub = auth.onAuthStateChanged((u) => {
      if (process.env.NODE_ENV !== 'production') {
        console.log('Auth state changed:', u ? `User logged in: ${u.uid}` : 'User logged out');
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

  // Detect mobile screen size and update filter state
  useEffect(() => {
    const checkMobile = () => {
      const newIsMobile = window.innerWidth < 768;
      const isDesktop = window.innerWidth >= 1024;
      
      setIsMobile(newIsMobile);
      
      // Update filter state based on screen size - expanded on desktop, collapsed on smaller screens
      setAreLowerFiltersCollapsed(!isDesktop);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Auto-hide welcome notification after 2 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowWelcomeNotification(false);
    }, 2000);
    
    return () => clearTimeout(timer);
  }, []);

  // Hide welcome notification on any click/touch anywhere on screen
  useEffect(() => {
    const handleInteraction = () => {
      if (showWelcomeNotification) {
        setShowWelcomeNotification(false);
      }
    };

    if (showWelcomeNotification) {
      document.addEventListener('click', handleInteraction);
      document.addEventListener('touchstart', handleInteraction);
    }

    return () => {
      document.removeEventListener('click', handleInteraction);
      document.removeEventListener('touchstart', handleInteraction);
    };
  }, [showWelcomeNotification]);


  // Initialize map
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loader.load();
      if (!mapRef.current || cancelled) return;

      const defaultCenter = { lat: 28.5383, lng: -81.3792 }; // Orlando, FL (East Coast US)
      const map = new google.maps.Map(mapRef.current, {
        center: defaultCenter,
        zoom: 13,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        scaleControl: true,
        scaleControlOptions: {
          style: google.maps.ScaleControlStyle.DEFAULT,
        },
        draggableCursor: 'crosshair',
        draggingCursor: 'url(http://maps.gstatic.com/mapfiles/closedhand_8_8.cur), move',
        gestureHandling: 'greedy', // Allow 1-finger panning on mobile
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
          
          // Clear selected control when map is clicked
          setSelectedControl(null);
          
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

  // Automatic location detection and button selection on initial load
  useEffect(() => {
    if (!mapInstance.current) return;

    // Only run this once when the map is first loaded
    const handleInitialLocation = () => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            setCenter(c);
            mapInstance.current?.setCenter(c);
            // Automatically select "Use my location" button and search
            setSelectedControl('location');
            // Search nearby places
            setTimeout(() => {
              searchNearby(c, undefined, undefined, false);
            }, 500);
          },
          () => {
            // Location not available, use default zip code 32439
            setZip('32439');
            setSelectedControl('zip');
            // Automatically search using the default zip code
            setTimeout(() => {
              geocodeZip();
            }, 500);
          }
        );
      } else {
        // Geolocation not supported, use default zip code 32439
        setZip('32439');
        setSelectedControl('zip');
        // Automatically search using the default zip code
        setTimeout(() => {
          geocodeZip();
        }, 500);
      }
    };

    // Delay the initial location detection to ensure the map is fully loaded
    const timer = setTimeout(handleInitialLocation, 1000);
    return () => clearTimeout(timer);
  }, []); // Empty dependency array since this should only run once on mount

  // Perform nearby search for both optometrist and eye doctor
  
  const searchNearby = async (
    c: google.maps.LatLngLiteral,
    targetPlaceId?: string,
    targetPlace?: TargetPlaceFromSaved,
    isFromManualClick = false
  ) => {
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
    const uniqueResults = allResults.filter((place, index, self) => 
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
        rating: targetPlace.rating ?? undefined,
        user_ratings_total: targetPlace.user_ratings_total ?? undefined,
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
        content: `<div style="font-size:14px;"><b>${p.name}</b><br/>${p.vicinity || p.formatted_address || ''}<br/>${savedPlacesRef.current[p.place_id] ? '<span style="color: #059669; font-weight: 500;">Saved ✅</span>' : ''}</div>`,
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
        
        // No save button in info windows - users can save from result cards instead
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
              mapInstance.current.setZoom(13);
            }
            // Manually trigger search after centering, including the target place
            setTimeout(() => searchNearby(placeCenter, placeIdFromUrl, savedPlace as TargetPlaceFromSaved, false), 500); // Allow auto-selection for URL navigation
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
                  mapInstance.current.setZoom(13);
                }
                // Manually trigger search after geocoding, including the target place
                setTimeout(() => searchNearby(placeCenter, placeIdFromUrl, savedPlace as TargetPlaceFromSaved, false), 500); // Allow auto-selection for URL navigation
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
    setSelectedControl('zip');
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
    setSelectedControl('location');
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
    <div className={`h-[100dvh] w-full relative ${isMobile ? `mobile-header-compensation ${isMobileControlsCollapsed ? 'collapsed' : ''}` : ''}`}>
      {/* Mobile Layout Container */}
      {isMobile && (
        <div className={`absolute top-0 left-0 z-40 bg-white/95 border-b border-gray-200 shadow-sm mobile-header ${isMobileControlsCollapsed ? 'collapsed' : ''}`}>
          {/* Mobile Header with Controls */}
          <div className="px-3 pt-3 pb-1 space-y-1">
            {/* Toggle Button Row */}
            <div className="flex items-center justify-start">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsMobileControlsCollapsed(!isMobileControlsCollapsed)}
                  className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
                  aria-label={isMobileControlsCollapsed ? 'Expand controls' : 'Collapse controls'}
                >
                  {isMobileControlsCollapsed ? (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                      Show Controls
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                      Hide Controls
                    </>
                  )}
                </button>
              </div>

            </div>

            {/* Collapsible Controls */}
            {!isMobileControlsCollapsed && (
              <>
                {/* ZIP Code and Location Row - Compact */}
                <div className="flex flex-col gap-1">
                  <input
                    value={zip}
                    onChange={(e) => setZip(e.target.value)}
                    placeholder="ZIP code"
                    className="border rounded-lg px-3 py-1.5 transition-colors duration-200 w-full text-sm"
                    aria-label="ZIP code"
                  />
                  <div className="flex gap-2">
                    <button 
                      onClick={geocodeZip} 
                      className={`border rounded-lg px-3 py-1.5 transition-colors duration-200 cursor-pointer flex-1 text-sm ${
                        selectedControl === 'zip' 
                          ? 'bg-purple-200/60 border-purple-300' 
                          : 'hover:bg-gray-50'
                      }`}
                    >
                      Use zip code
                    </button>

                    <button 
                      onClick={handleRecenter} 
                      className={`border rounded-lg px-3 py-1.5 transition-colors duration-200 cursor-pointer flex-1 text-sm ${
                        selectedControl === 'location' 
                          ? 'bg-purple-200/60 border-purple-300' 
                          : 'hover:bg-gray-50'
                      }`}
                    >
                      Use my location
                    </button>
                  </div>
                  
                  {/* Hide filters button next to the button row */}
                  {!areLowerFiltersCollapsed && (
                    <button
                      onClick={() => setAreLowerFiltersCollapsed(true)}
                      className="border rounded-lg px-2 py-1.5 transition-colors duration-200 cursor-pointer text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                      aria-label="Hide filters"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                  )}
                </div>

                {/* Radius and Search Options Row - Ultra Compact (collapsible on mobile) */}
                {!areLowerFiltersCollapsed && (
                <div className="flex items-center justify-between gap-2 -mt-0.5">
                  <div className="flex items-center gap-1.5">
                    <label htmlFor="radius-select" className="text-xs text-gray-600 whitespace-nowrap">
                      Search radius:
                    </label>
                    <select
                      id="radius-select"
                      value={radiusMiles}
                      onChange={(e) => setRadiusMiles(Number(e.target.value))}
                      className="border rounded px-1.5 py-0.5 text-xs bg-white"
                    >
                      <option value={1}>1 mile</option>
                      <option value={2}>2 miles</option>
                      <option value={3}>3 miles</option>
                      <option value={5}>5 miles</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-1.5 bg-gray-50/80 rounded px-1.5 py-0.5">
                    <span className="text-xs text-gray-700 font-medium">
                      Search for:
                    </span>
                    <div className="flex gap-1.5">
                      <label className="flex items-center gap-0.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={searchOptometrist}
                          onChange={(e) => setSearchOptometrist(e.target.checked)}
                          className="w-3 h-3 text-blue-600 rounded focus:ring-blue-500"
                        />
                        <span className="text-xs text-gray-700">Optometrist</span>
                      </label>
                      <label className="flex items-center gap-0.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={searchEyeCareCenter}
                          onChange={(e) => setSearchEyeCareCenter(e.target.checked)}
                          className="w-3 h-3 text-blue-600 rounded focus:ring-blue-500"
                        />
                        <span className="text-xs text-gray-700">Eye care center</span>
                      </label>
                    </div>
                  </div>
                </div>
                )}

                {/* Show filters button - mobile: right-aligned to avoid results panel */}
                {areLowerFiltersCollapsed && (
                  <div className="pt-1 flex justify-end">
                    <button
                      onClick={() => setAreLowerFiltersCollapsed(false)}
                      className="text-xs text-gray-600 hover:text-gray-900 px-2 py-1 rounded"
                      aria-label="Show filters"
                    >
                      <span className="inline-flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                        Show filters
                      </span>
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Desktop Controls */}
      {!isMobile && (
        <div className="absolute top-4 left-4 z-30 bg-white/90 rounded-2xl shadow" style={{ maxWidth: 'min(36rem, calc(100vw - 360px))' }}>
          <div className="p-3 flex flex-wrap gap-2">
            {/* ZIP Code and Location Row */}
            <div className="flex gap-2 justify-between items-center">
              <div className="flex gap-2">
                <input
                  value={zip}
                  onChange={(e) => setZip(e.target.value)}
                  placeholder="ZIP code"
                  className="border rounded-lg px-3 py-2 transition-colors duration-200 w-36"
                  aria-label="ZIP code"
                />
                <button 
                  onClick={geocodeZip} 
                  className={`border rounded-lg px-3 py-2 transition-colors duration-200 cursor-pointer ${
                    selectedControl === 'zip' 
                      ? 'bg-purple-200/60 border-purple-300' 
                      : 'hover:bg-gray-50'
                  }`}
                >
                  Use zip code
                </button>

                <button 
                  onClick={handleRecenter} 
                  className={`border rounded-lg px-3 py-2 transition-colors duration-200 cursor-pointer ${
                    selectedControl === 'location' 
                      ? 'bg-purple-200/60 border-purple-300' 
                      : 'hover:bg-gray-50'
                  }`}
                >
                  Use my location
                </button>
              </div>
              
              {/* Hide filters button - positioned on the right */}
              {!areLowerFiltersCollapsed && (
                <button
                  onClick={() => setAreLowerFiltersCollapsed(true)}
                  className="border rounded-lg px-2 py-2 transition-colors duration-200 cursor-pointer text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                  aria-label="Hide filters"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                </button>
              )}
            </div>

            {/* Radius and Search Options Row - Desktop (collapsible) */}
            {!areLowerFiltersCollapsed && (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2">
                  <label htmlFor="radius-select" className="text-sm text-gray-600 whitespace-nowrap">
                    Search radius:
                  </label>
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
                  </select>
                </div>

                <div className="flex items-center gap-3 bg-gray-50/80 rounded-lg px-3 py-2">
                  <span className="text-sm text-gray-700 font-medium">
                    Search for:
                  </span>
                  <div className="flex gap-3">
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
              </div>
            )}

            {/* Desktop Show filters toggle */}
            {areLowerFiltersCollapsed && (
              <div className="flex justify-center">
                <button
                  onClick={() => setAreLowerFiltersCollapsed(false)}
                  className="text-xs text-gray-600 hover:text-gray-900 px-2 py-1 rounded"
                  aria-label="Show filters"
                >
                  <span className="inline-flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                    Show filters
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Results panel */}
      <div className={`absolute z-30 bg-white/95 rounded-2xl shadow transition-all duration-300 ease-in-out ${
        isMobile 
          ? isResultsCollapsed 
            ? 'left-4 top-20 w-12 h-12' 
            : 'left-4 top-20 w-[calc(100vw-2rem)] max-w-sm max-h-[calc(100vh-6rem)]'
          : 'left-4 top-32 w-80 max-h-[65vh]'
      } overflow-hidden`}>
        {/* Collapse/Expand Button for Mobile */}
        {isMobile && (
          <button
            onClick={() => setIsResultsCollapsed(!isResultsCollapsed)}
            className={`absolute top-2 right-2 z-20 w-8 h-8 bg-white/90 rounded-full shadow-md flex items-center justify-center transition-all duration-200 ${
              isResultsCollapsed ? 'hover:bg-gray-100' : 'hover:bg-gray-100'
            }`}
            aria-label={isResultsCollapsed ? 'Expand results' : 'Collapse results'}
          >
            {isResultsCollapsed ? (
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            )}
          </button>
        )}

        {/* Results Content */}
        <div className={`p-3 ${isResultsCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'} overflow-y-auto ${isMobile ? 'max-h-[calc(100vh-8rem)]' : 'max-h-[calc(65vh-2rem)]'}`}>
          <div className="font-semibold mb-2 flex items-center justify-between">
            <span>Results ({places.length})</span>
            {isMobile && (
              <span className="text-xs text-gray-500">
                {isResultsCollapsed ? '' : 'Tap to collapse'}
              </span>
            )}
          </div>
          
          {/* Mobile Scroll Hint */}
          {isMobile && places.length > 3 && (
            <div className="text-xs text-gray-500 text-center mb-2 pb-2 border-b border-gray-200">
              📱 Scroll down to see more results
            </div>
          )}
          
          {/* Desktop Scroll Hint */}
          {!isMobile && places.length > 8 && (
            <div className="text-xs text-gray-500 text-center mb-2 pb-2 border-b border-gray-200">
              🖱️ Scroll down to see more results
            </div>
          )}
          
          {/* Mobile Results Count Badge when collapsed */}
          {isMobile && isResultsCollapsed && places.length > 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="bg-blue-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
                {places.length > 99 ? '99+' : places.length}
              </div>
            </div>
          )}
          
          {/* Mobile Results Hint */}
          {isMobile && isResultsCollapsed && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-xs text-gray-400 text-center">
                {places.length > 0 ? 'Tap to view' : 'No results'}
              </div>
            </div>
          )}
          
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
                className += 'border-green-400 bg-green-50/50 shadow-lg scale-[1.02] z-20 relative';
              } else if (isLostCause) {
                className += 'border-red-500 bg-red-50 opacity-75';
              } else if (isSavedAndMet) {
                className += 'bg-gray-100 border-gray-300';
              }
              
              return (
              <li 
                key={p.place_id} 
                className={`${className} cursor-pointer relative ${!isHovered && !isSelected ? 'hover:shadow-xl hover:scale-[1.02] hover:border-green-400 hover:bg-green-50/50 hover:z-[100]' : ''}`}
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
                <div className={`mt-2 flex gap-2 ${isMobile ? 'flex-wrap' : ''}`}>
                  <button
                    className={`text-xs border rounded px-2 py-1 transition-colors duration-200 hover:bg-gray-50 ${
                      isMobile ? 'flex-1 text-center' : ''
                    }`}
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
                    {isMobile ? 'Map' : 'View on map'}
                  </button>
                  <button
                    className={`text-xs border rounded px-2 py-1 transition-colors duration-200 hover:bg-gray-50 ${
                      isMobile ? 'flex-1 text-center' : ''
                    }`}
                    onClick={(e) => {
                      e.stopPropagation(); // Prevent card click
                      getDirections(p);
                    }}
                  >
                    {isMobile ? 'Route' : 'Directions'}
                  </button>
                  <button
                    className={`text-xs border rounded px-2 py-1 transition-colors duration-200 ${
                      isMobile ? 'flex-1 text-center' : ''
                    } ${
                      saved 
                        ? 'bg-green-100 text-green-700 border-green-300 cursor-default' 
                        : 'hover:bg-gray-50'
                    }`}
                    onClick={(e) => {
                      if (!saved) {
                        e.stopPropagation(); // Prevent card click
                        savePlace(p);
                      }
                    }}
                    disabled={!!saved}
                  >
                    {saved ? 'Saved ✅' : 'Save'}
                  </button>
                </div>
              </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* Map canvas */}
      <div ref={mapRef} className="h-full w-full rounded-none" />
      
      {/* Mobile Floating Action Button for Quick Access */}
      {isMobile && (
        <div className="fixed bottom-4 right-4 z-30">
          <div className="flex flex-col gap-2">
            {/* Quick Search Button */}
            {places.length === 0 && (
              <button
                onClick={() => {
                  if (center) {
                    searchNearby(center, undefined, undefined, false);
                  }
                }}
                className="w-12 h-12 bg-blue-500 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-blue-600 transition-colors duration-200"
                aria-label="Quick search"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>
            )}
            
            {/* Quick Results Toggle */}
            {places.length > 0 && (
              <button
                onClick={() => setIsResultsCollapsed(!isResultsCollapsed)}
                className="w-12 h-12 bg-green-500 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-green-600 transition-colors duration-200"
                aria-label={isResultsCollapsed ? 'Show results' : 'Hide results'}
              >
                {isResultsCollapsed ? (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                )}
              </button>
            )}
          </div>
        </div>
      )}
      
      {/* Welcome notification */}
      {showWelcomeNotification && (
        <div className={`fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 bg-gradient-to-r from-blue-500 to-purple-600 text-white px-8 py-6 rounded-2xl shadow-2xl transition-all duration-500 ease-in-out max-w-sm mx-4 ${
          showWelcomeNotification ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`}>
          <div className="text-center">
            <div className="flex justify-center mb-3">
              <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
            </div>
            <h3 className="text-xl font-semibold mb-3">Welcome! 👋</h3>
            <p className="text-base leading-relaxed opacity-95">
              Click anywhere on the map to discover nearby optometrists and eye care practices in that area.
            </p>
            <button
              onClick={() => setShowWelcomeNotification(false)}
              className="mt-4 text-xs text-white/80 hover:text-white underline transition-colors duration-200"
            >
              Got it!
            </button>
          </div>
        </div>
      )}

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