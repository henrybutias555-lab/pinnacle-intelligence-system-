/**
 * ==============================================================================
 * Pinnacle Intelligence System (PIS) - Frontend Supabase Client
 * File: artifacts/pinnacle-pis/src/lib/supabase.ts
 * ==============================================================================
 * 
 * WHY THIS RESOLVES THE VERCEL 404 "NOT FOUND" ISSUE:
 * ---------------------------------------------------
 * When you deploy a Vite Single Page Application (SPA) to Vercel, requests to
 * `/api/auth/login` and `/api/auth/register` fail with 404 NOT_FOUND because Vercel
 * only hosts your static HTML/JS/CSS assets unless a serverless function is configured.
 * 
 * By using this Supabase client directly in your React/Vite frontend:
 * 1. Account creation and logins communicate DIRECTLY with Supabase Auth:
 *    https://rlwmfgfbvulkzksgmzpq.supabase.co/auth/v1/...
 * 2. It bypasses any middleman serverless function, completely eliminating 404 errors.
 * 3. Supabase automatically handles session persistence in localStorage/cookies,
 *    token refreshing, and secure JWT verification.
 * ==============================================================================
 */

import { createClient, SupabaseClient, User, Session, AuthError } from '@supabase/supabase-js';

// User Supabase Project configuration
export const SUPABASE_URL: string =
  (import.meta as any).env?.VITE_SUPABASE_URL || 'https://rlwmfgfbvulkzksgmzpq.supabase.co';

export const SUPABASE_ANON_KEY: string =
  (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';

/**
 * Operative / User registration payload structure
 */
export interface OperativeSignUpData {
  email: string;
  password: string;
  fullName: string;
  clearanceLevel?: 'Alpha' | 'Beta' | 'Gamma' | 'Omega';
  department?: string;
  badgeNumber?: string;
}

export interface OperativeProfile {
  id: string;
  email: string;
  fullName: string;
  clearanceLevel: string;
  department: string;
  badgeNumber?: string;
  lastActive?: string;
}

export interface AuthResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  details?: AuthError | null;
}

/**
 * Singleton Supabase Client Instance
 * Configured with auto-refreshing tokens and persistent browser session storage.
 */
export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY || 'public-anon-key-placeholder', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  },
});

/**
 * Direct Account Creation (Sign Up)
 * Connects directly to Supabase Auth and stores profile metadata
 */
export async function signUpOperative(
  payload: OperativeSignUpData
): Promise<AuthResponse<{ user: User | null; session: Session | null }>> {
  try {
    if (!SUPABASE_ANON_KEY) {
      console.warn(
        '[Pinnacle Supabase] VITE_SUPABASE_ANON_KEY is not configured. Account creation requires a valid anon key from your Supabase dashboard.'
      );
    }

    const { data, error } = await supabase.auth.signUp({
      email: payload.email.trim(),
      password: payload.password,
      options: {
        data: {
          full_name: payload.fullName.trim(),
          clearance_level: payload.clearanceLevel || 'Alpha',
          department: payload.department || 'Intelligence Operations',
          badge_number: payload.badgeNumber || `PIS-${Math.floor(1000 + Math.random() * 9000)}`,
        },
      },
    });

    if (error) {
      return {
        success: false,
        error: error.message,
        details: error,
      };
    }

    return {
      success: true,
      data: {
        user: data.user,
        session: data.session,
      },
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Unexpected error occurred during operative registration.',
    };
  }
}

/**
 * Direct Operative Login (Sign In With Password)
 * Authenticates user credentials directly against Supabase Auth.
 */
export async function signInOperative(
  email: string,
  password: string
): Promise<AuthResponse<{ user: User; session: Session }>> {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      return {
        success: false,
        error: error.message,
        details: error,
      };
    }

    if (!data.user || !data.session) {
      return {
        success: false,
        error: 'Login completed but no session was returned by Supabase.',
      };
    }

    return {
      success: true,
      data: {
        user: data.user,
        session: data.session,
      },
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Unexpected error occurred during authentication.',
    };
  }
}

/**
 * Sign Out Current Operative
 */
export async function signOutOperative(): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Error signing out' };
  }
}

/**
 * Fetch Current Session and User Info
 */
export async function getCurrentOperative(): Promise<{
  user: User | null;
  session: Session | null;
  profile?: OperativeProfile | null;
}> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !session.user) {
      return { user: null, session: null, profile: null };
    }

    const user = session.user;
    const metadata = user.user_metadata || {};

    const profile: OperativeProfile = {
      id: user.id,
      email: user.email || '',
      fullName: metadata.full_name || 'Operative',
      clearanceLevel: metadata.clearance_level || 'Alpha',
      department: metadata.department || 'Field Intelligence',
      badgeNumber: metadata.badge_number || `PIS-${user.id.slice(0, 4)}`,
      lastActive: new Date().toISOString(),
    };

    return { user, session, profile };
  } catch (err) {
    console.error('Failed to retrieve current operative:', err);
    return { user: null, session: null, profile: null };
  }
}

/**
 * Subscribe to Supabase Auth State Changes
 * (login, logout, token refresh, password recovery)
 */
export function onAuthStateChange(callback: (user: User | null, session: Session | null) => void) {
  const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user || null, session);
  });
  return subscription;
}
