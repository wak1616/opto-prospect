import { Suspense } from 'react';
import Map from '../components/Map';

// Force dynamic rendering to prevent static generation issues with Maps/Firebase
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function HomePage() {
  return (
    <main>
      <Suspense fallback={<div className="flex items-center justify-center min-h-screen">Loading...</div>}>
        <Map />
      </Suspense>
    </main>
  );
}