'use client';

import { auth, googleProvider } from '@/lib/firebase';
import { signInWithPopup, signOut, onAuthStateChanged, type User } from 'firebase/auth';
import { useEffect, useState } from 'react';

export default function AuthButton() {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [imageError, setImageError] = useState(false);
    
    useEffect(() => {
        let mounted = true;
        
        // Check if user is already available
        if (auth.currentUser && mounted) {
          setUser(auth.currentUser);
          setLoading(false);
          return;
        }
        
        // Set a maximum loading time to prevent indefinite loading
        const loadingTimeout = setTimeout(() => {
          if (mounted && !auth.currentUser) {
            setLoading(false);
          }
        }, 50); // Short timeout to prevent flicker
        
        const unsub = onAuthStateChanged(auth, (user) => {
          if (!mounted) return;
          
          clearTimeout(loadingTimeout);
          
          if (user) {
            process.env.NODE_ENV !== 'production' && console.log('User logged in:', {
              displayName: user.displayName,
              email: user.email,
              photoURL: user.photoURL
            });
          }
          setUser(user);
          setLoading(false);
          setImageError(false);
        });
        
        return () => {
          mounted = false;
          clearTimeout(loadingTimeout);
          unsub();
        };
      }, []);
    
      if (loading) {
        return (
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
        );
      }
    
      if (!user) {
        return (
          <button
            onClick={async () => { 
              try {
                await signInWithPopup(auth, googleProvider);
              } catch (error) {
                console.error('Sign-in error:', error);
              }
            }}
            className="flex items-center gap-2 border rounded-lg px-4 py-2 bg-white hover:bg-gray-50 transition-colors shadow-sm"
            aria-label="Sign in with Google"
          >
            {/* Google Icon */}
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Sign in with Google
          </button>
        );
      }
      return (
        <div className="flex items-center gap-3 bg-white rounded-lg border shadow-sm px-3 py-2">
          {/* User Avatar */}
          <div className="flex items-center gap-2">
            {user.photoURL && !imageError ? (
              <img
                src={user.photoURL.replace('=s96-c', '=s96-c-rp-mo')}
                alt={user.displayName || 'User'}
                className="w-8 h-8 rounded-full border-2 border-gray-200"
                referrerPolicy="no-referrer"
                crossOrigin="anonymous"
                onError={(e) => {
                  process.env.NODE_ENV !== 'production' && console.log('Image failed to load, trying fallback:', user.photoURL);
                  // Try the original URL without modifications
                  const img = e.target as HTMLImageElement;
                  if (img.src !== user.photoURL && user.photoURL) {
                    img.src = user.photoURL;
                  } else {
                    setImageError(true);
                  }
                }}
                onLoad={() => {
                  process.env.NODE_ENV !== 'production' && console.log('Image loaded successfully:', user.photoURL);
                }}
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center">
                <span className="text-gray-600 text-sm font-medium">
                  {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            <div className="flex flex-col">
              <span className="text-sm font-medium text-gray-900">
                Hi, {user.displayName || user.email?.split('@')[0]}
              </span>
              {user.displayName && user.email && (
                <span className="text-xs text-gray-500">{user.email}</span>
              )}
            </div>
          </div>
          
          <div className="h-6 w-px bg-gray-300"></div>
          
          <button
            onClick={() => signOut(auth)}
            className="text-sm text-gray-600 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-50 transition-colors"
            aria-label="Sign out"
          >
            Sign out
          </button>
        </div>
      );
    }