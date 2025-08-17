'use client';

import { useEffect, useMemo, useState } from 'react';
import { auth, db } from '@/lib/firebase';
import {
  collection, doc, onSnapshot, query, orderBy, updateDoc,
  addDoc, serverTimestamp, getDocs, deleteDoc
} from 'firebase/firestore';
import { useRouter } from 'next/navigation';

type SavedOptometrist = {
  id: string;                // place_id
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  rating: number | null;
  user_ratings_total: number | null;
  phone: string | null;
  met: boolean;
  lostCause: boolean;
  notes: string;
  createdAt?: import('firebase/firestore').Timestamp;
  updatedAt?: import('firebase/firestore').Timestamp;
};

type EventItem = {
  id: string;
  text: string;
  date?: string; // optional plain date string user enters
  createdAt?: import('firebase/firestore').Timestamp;
};

export default function SavedPage() {
  const router = useRouter();
  const [items, setItems] = useState<SavedOptometrist[]>([]);
  const [events, setEvents] = useState<Record<string, EventItem[]>>({});
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});
  const [userId, setUserId] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  // Separate items into regular and lost cause
  const regularItems = useMemo(() => items.filter(item => !item.lostCause), [items]);
  const lostCauseItems = useMemo(() => items.filter(item => item.lostCause), [items]);

  // Track auth user
  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      setUserId(u ? u.uid : null);
    });
    return () => unsub();
  }, []);

  // Subscribe to saved optometrists
  useEffect(() => {
    if (!userId) {
      setItems([]);
      setEvents({});
      return;
    }
    const col = collection(db, 'users', userId, 'optometrists');
    const q = query(col, orderBy('name'));
    const unsub = onSnapshot(q, (snap) => {
      const list: SavedOptometrist[] = [];
      snap.forEach((doc) => {
        const d = doc.data() as Omit<SavedOptometrist, 'id'>;
        list.push({ id: doc.id, ...d });
      });
      setItems(list);
      // Initialize notes drafts with current notes (once, or keep if already typing)
      setNotesDraft((prev) => {
        const next = { ...prev };
        for (const it of list) {
          if (!(it.id in next)) next[it.id] = it.notes ?? '';
        }
        return next;
      });
      
      // Auto-load events for all optometrists
      list.forEach((item) => {
        loadEvents(item.id);
      });
    });
    return () => unsub();
  }, [userId]);

  // Load events for each item (simple on-demand fetch)
  const loadEvents = async (placeId: string) => {
    if (!userId) return;
    const col = collection(db, 'users', userId, 'optometrists', placeId, 'events');
    const snap = await getDocs(col);
    const rows: EventItem[] = [];
    snap.forEach((d) => rows.push({ id: d.id, ...(d.data() as Omit<EventItem, 'id'>) }));
    setEvents((prev) => ({ ...prev, [placeId]: rows }));
  };

  const toggleMet = async (placeId: string, current: boolean) => {
    if (!userId) return alert('Please sign in.');
    const ref = doc(db, 'users', userId, 'optometrists', placeId);
    await updateDoc(ref, { met: !current, updatedAt: serverTimestamp() });
  };

  const toggleLostCause = async (placeId: string, current: boolean) => {
    if (!userId) return alert('Please sign in.');
    const ref = doc(db, 'users', userId, 'optometrists', placeId);
    await updateDoc(ref, { lostCause: !current, updatedAt: serverTimestamp() });
  };

  const saveNotes = async (placeId: string) => {
    if (!userId) return alert('Please sign in.');
    const ref = doc(db, 'users', userId, 'optometrists', placeId);
    const notes = notesDraft[placeId] ?? '';
    await updateDoc(ref, { notes, updatedAt: serverTimestamp() });
  };

  const addEvent = async (placeId: string, text: string, date?: string) => {
    if (!userId) return alert('Please sign in.');
    if (!text.trim()) return;
    const col = collection(db, 'users', userId, 'optometrists', placeId, 'events');
    await addDoc(col, { text, date: date || null, createdAt: serverTimestamp() });
    await loadEvents(placeId);
  };

  const deleteOptometrist = async (placeId: string, name: string) => {
    if (!userId) return alert('Please sign in.');
    
    const confirmed = window.confirm(
                    `Are you sure you want to permanently delete "${name}" and all associated data?\n\n` +
              `This will remove:\n` +
              `• The optometrist entry\n` +
              `• All notes\n` +
              `• All events\n` +
              `• All other associated data\n\n` +
              `This action cannot be undone.`
    );
    
    if (!confirmed) return;
    
    try {
      // First, delete all events in the subcollection
      const eventsCol = collection(db, 'users', userId, 'optometrists', placeId, 'events');
      const eventsSnapshot = await getDocs(eventsCol);
      
      // Delete all event documents
      const deletePromises = eventsSnapshot.docs.map(eventDoc => 
        deleteDoc(doc(db, 'users', userId, 'optometrists', placeId, 'events', eventDoc.id))
      );
      await Promise.all(deletePromises);
      
      // Then delete the main optometrist document
      const optometristRef = doc(db, 'users', userId, 'optometrists', placeId);
      await deleteDoc(optometristRef);
      
      alert(`Successfully deleted "${name}" and all associated data.`);
    } catch (error) {
      console.error('Error deleting optometrist:', error);
      alert('Failed to delete. Please try again.');
    }
  };

  const renderOptometristItem = (it: SavedOptometrist) => {
    if (!isExpanded) {
      // Collapsed view - compact display
      return (
        <li key={it.id} className={`${it.lostCause ? 'border-2 border-red-500 bg-gray-50 opacity-75' : 'border-2 border-green-500 bg-white'} rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow`}>
          <div className="flex justify-between items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="font-medium text-base truncate">{it.name}</div>
              <div className="text-sm text-gray-600 truncate">{it.address}</div>
              <div className="text-xs text-gray-500">
                {it.rating != null ? `⭐ ${it.rating}` : 'No rating'}{' '}
                {it.user_ratings_total != null ? `(${it.user_ratings_total})` : ''}
              </div>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button
                className="text-blue-600 hover:text-blue-800 text-sm underline"
                onClick={() => onViewOnMap(it.id)}
              >
                Map
              </button>
              <button
                className="text-green-600 hover:text-green-800 text-sm underline"
                onClick={() => onDirections(it.lat, it.lng, it.address)}
              >
                Directions
              </button>
            </div>
          </div>
        </li>
      );
    }

    // Expanded view - full display (existing layout)
    return (
      <li key={it.id} className={`${it.lostCause ? 'border-2 border-red-500 bg-gray-100 opacity-75' : 'border-2 border-green-500 bg-white'} rounded-xl p-4 shadow-sm`}>
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
          <div className="flex-1">
            <div className="font-medium text-lg">{it.name}</div>
            <div className="text-sm text-gray-600 mt-1">{it.address}</div>
            {it.phone && (
              <div className="text-sm text-gray-600 mt-1">
                📞 <a href={`tel:${it.phone}`} className="text-blue-600 hover:text-blue-800 underline">{it.phone}</a>
              </div>
            )}
            <div className="text-xs text-gray-500 mt-1">
              {it.rating != null ? `⭐ ${it.rating}` : 'No rating'}{' '}
              {it.user_ratings_total != null ? `(${it.user_ratings_total})` : ''}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 sm:flex-nowrap">
            <button
              className="border rounded-lg px-3 py-2 text-sm font-medium bg-white hover:bg-blue-50 hover:border-blue-400 hover:text-blue-700 transition-all duration-200 shadow-sm hover:shadow-md"
              onClick={() => onViewOnMap(it.id)}
            >
              View on Map
            </button>
            <button
              className="border rounded-lg px-3 py-2 text-sm font-medium bg-white hover:bg-green-50 hover:border-green-400 hover:text-green-700 transition-all duration-200 shadow-sm hover:shadow-md"
              onClick={() => onDirections(it.lat, it.lng, it.address)}
            >
              Directions
            </button>
            <button
              className="border border-red-500 bg-red-50 text-red-700 hover:bg-red-100 hover:border-red-600 hover:shadow-md rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 shadow-sm"
              onClick={() => deleteOptometrist(it.id, it.name)}
            >
              Delete
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 sm:gap-3 items-center">
          <button
            className={`rounded-lg px-4 py-2 text-sm font-medium border transition-all duration-200 shadow-sm hover:shadow-md ${it.met ? 'bg-green-600 text-white border-green-600 hover:bg-green-700' : 'bg-white text-gray-800 hover:bg-green-50 hover:border-green-400 hover:text-green-700'}`}
            onClick={() => toggleMet(it.id, it.met)}
          >
            {it.met ? 'Met ✅' : 'Mark as Met'}
          </button>
          <button
            className={`rounded-lg px-4 py-2 text-sm font-medium border transition-all duration-200 shadow-sm hover:shadow-md ${it.lostCause ? 'bg-red-600 text-white border-red-600 hover:bg-red-700' : 'bg-white text-gray-800 border-red-300 hover:bg-red-50 hover:border-red-400 hover:text-red-700'}`}
            onClick={() => toggleLostCause(it.id, it.lostCause)}
          >
            {it.lostCause ? 'Lost Cause ❌' : 'Lost Cause'}
          </button>
        </div>

        <div className="mt-5">
          <div className="text-sm font-bold mb-2">Notes</div>
          <textarea
            className="w-full border rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            rows={3}
            value={notesDraft[it.id] ?? ''}
            onChange={(e) => setNotesDraft((prev) => ({ ...prev, [it.id]: e.target.value }))}
            placeholder="Add notes..."
          />
          <div className="mt-3">
            <button
              className="border rounded-lg px-4 py-2 text-sm font-medium bg-white hover:bg-blue-50 hover:border-blue-400 hover:text-blue-700 transition-all duration-200 shadow-sm hover:shadow-md"
              onClick={() => saveNotes(it.id)}
            >
              Save Notes
            </button>
          </div>
        </div>

        <div className="mt-5">
          <div className="text-sm font-bold mb-2">
            Events
          </div>
          <ul className="mt-1 text-sm space-y-1">
            {(events[it.id] ?? []).map((ev) => (
              <li key={ev.id} className="text-gray-700">
                • {ev.text} {ev.date ? `— ${ev.date}` : ''}
              </li>
            ))}
          </ul>
          <AddEventInline onAdd={(text, date) => addEvent(it.id, text, date)} />
        </div>
      </li>
    );
  };

  const onViewOnMap = (placeId: string) => {
    // Send the user to `/` with ?placeId=... so Map can focus it
    router.push(`/?placeId=${encodeURIComponent(placeId)}`);
  };

  const onDirections = (lat: number | null, lng: number | null, address: string) => {
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

  if (userId === null) {
    return (
      <main className="p-6 pt-20 md:pt-24">
        <div className="text-gray-700">Please sign in to view your saved list.</div>
      </main>
    );
  }

  return (
    <main className="p-6 pt-20 md:pt-24">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900">Saved Optometrists ({items.length})</h1>
        {items.length > 0 && (
          <div className="flex gap-2">
            <button
              onClick={() => setIsExpanded(true)}
              className={`px-4 py-2 text-sm font-medium rounded-lg border transition-all duration-200 ${
                isExpanded 
                  ? 'bg-blue-600 text-white border-blue-600' 
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-blue-50 hover:border-blue-400'
              }`}
            >
              Expand
            </button>
            <button
              onClick={() => setIsExpanded(false)}
              className={`px-4 py-2 text-sm font-medium rounded-lg border transition-all duration-200 ${
                !isExpanded 
                  ? 'bg-blue-600 text-white border-blue-600' 
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-blue-50 hover:border-blue-400'
              }`}
            >
              Collapse
            </button>
          </div>
        )}
      </div>
      
      {items.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <div className="text-blue-600 mt-0.5">ℹ️</div>
            <div className="text-sm text-blue-800">
              <strong>Map Visibility:</strong> Optometrists marked as <span className="bg-red-600 text-white px-2 py-1 rounded text-xs font-medium">Lost Cause ❌</span> will not appear on the map during searches, helping you focus on active prospects. Regular saved optometrists remain visible on the map.
            </div>
          </div>
        </div>
      )}
      {items.length === 0 ? (
        <div className="text-gray-600">Nothing saved yet. Go back to the map and hit &quot;Save&quot;.</div>
      ) : (
        <div className="space-y-6">
          {/* Regular Items */}
          {regularItems.length > 0 && (
            <ul className={isExpanded ? "space-y-4" : "space-y-2"}>
              {regularItems.map(renderOptometristItem)}
            </ul>
          )}
          
          {/* Lost Cause Separator */}
          {regularItems.length > 0 && lostCauseItems.length > 0 && (
            <div className="flex items-center my-8">
              <hr className="flex-1 border-gray-300" />
              <span className="px-4 text-base font-bold text-red-600 bg-white flex items-center gap-1">
                Lost Causes ({lostCauseItems.length})
              </span>
              <hr className="flex-1 border-gray-300" />
            </div>
          )}
          
          {/* Lost Cause Items */}
          {lostCauseItems.length > 0 && (
            <ul className={isExpanded ? "space-y-4" : "space-y-2"}>
              {lostCauseItems.map(renderOptometristItem)}
            </ul>
          )}
        </div>
      )}
    </main>
  );
}

function AddEventInline({ onAdd }: { onAdd: (text: string, date?: string) => void }) {
  const [text, setText] = useState('');
  const [date, setDate] = useState('');
  return (
    <div className="mt-3 space-y-2 sm:space-y-0 sm:flex sm:flex-wrap sm:items-center sm:gap-2">
      <input
        className="w-full sm:flex-1 sm:min-w-48 border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
        placeholder='e.g., "Met at Starbucks"'
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <input
        type="date"
        className="w-full sm:w-auto border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        title="Event date (optional)"
      />
      <button
        className="w-full sm:w-auto border rounded-lg px-4 py-2 text-sm font-medium bg-white hover:bg-green-50 hover:border-green-400 hover:text-green-700 transition-all duration-200 shadow-sm hover:shadow-md"
        onClick={() => {
          onAdd(text, date);
          setText('');
          setDate('');
        }}
      >
        Add Event
      </button>
    </div>
  );
}