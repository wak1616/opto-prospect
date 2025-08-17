'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';

export default function NavButton() {
  const pathname = usePathname();
  
  if (pathname === '/saved') {
    return (
      <Link href="/" className="border rounded-lg px-3 py-2 hover:bg-gray-50 font-bold">
        Back To Map
      </Link>
    );
  }
  
  return (
    <Link href="/saved" className="border rounded-lg px-3 py-2 hover:bg-gray-50 font-bold">
      View Saved Locations
    </Link>
  );
}
