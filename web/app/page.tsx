import { Suspense } from 'react';
import Map from '../components/Map';

export default function HomePage() {
  return (
    <main>
      <Suspense fallback={<div className="flex items-center justify-center min-h-screen">Loading...</div>}>
        <Map />
      </Suspense>
    </main>
  );
}