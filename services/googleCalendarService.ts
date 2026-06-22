import { getCachedAccessToken, setCachedAccessToken } from './authService';
import { auth } from './firebaseClient';
import { GoogleAuthProvider, signInWithPopup, linkWithPopup } from 'firebase/auth';

export const isGoogleCalendarConnected = () => !!getCachedAccessToken();

export const connectGoogleCalendar = async () => {
  if (!auth) throw new Error("Firebase Auth not initialized");
  
  const provider = new GoogleAuthProvider();
  provider.addScope('https://www.googleapis.com/auth/calendar.events');
  provider.setCustomParameters({
    prompt: 'consent'
  });

  try {
    let userCredential;
    
    // We just want the token. signInWithPopup will change the user session if it's a different account.
    // If the user wants to use a different GMail account specifically for Calendar, 
    // it's best to just do signInWithPopup. They will technically switch Firebase Auth users.
    // But since this is what was requested (a separate step), we'll do signInWithPopup.
    userCredential = await signInWithPopup(auth, provider);
    
    const credential = GoogleAuthProvider.credentialFromResult(userCredential);
    if (credential?.accessToken) {
      setCachedAccessToken(credential.accessToken);
      return true;
    }
    return false;
  } catch (error) {
    console.error("Failed to connect Google Calendar", error);
    throw error;
  }
};

export const callGoogleCalendarAPI = async (method: string, endpoint: string, body?: any) => {
  const token = getCachedAccessToken();
  if (!token) throw new Error("No Google access token found. Please sign in with Google.");
  
  const response = await fetch(`https://www.googleapis.com/calendar/v3${endpoint}`, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      setCachedAccessToken(null); // Clear invalid token
    }
    const errorText = await response.text();
    throw new Error(`Google Calendar API Error: ${response.status} - ${errorText}`);
  }
  
  return response.json();
};
