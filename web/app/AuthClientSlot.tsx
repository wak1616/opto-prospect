'use client';
import dynamic from 'next/dynamic';

const AuthButton = dynamic(() => import('@/components/AuthButton'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center gap-3 bg-white rounded-lg border shadow-sm px-3 py-2">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse border-2 border-gray-200"></div>
        <div className="flex flex-col">
          <div className="w-20 h-4 bg-gray-200 rounded animate-pulse mb-1"></div>
          <div className="w-24 h-3 bg-gray-200 rounded animate-pulse"></div>
        </div>
      </div>
      <div className="h-6 w-px bg-gray-300"></div>
      <div className="w-12 h-4 bg-gray-200 rounded animate-pulse"></div>
    </div>
  )
});

export default function AuthClientSlot() { 
  return <AuthButton />; 
}