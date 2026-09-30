import React, { useState } from 'react';
import LandingPage from '../../components/LandingPage';

// Person 1: sign-in and the access, identity and comms screens. Stub: the demo persona picker.
export function AuthGate({ children }) {
  const [user, setUser] = useState(null);
  if (!user) {
    return <LandingPage onLaunchConsole={(id = 'p-priya', name = 'Priya Menon (Ops Lead)') =>
      setUser({ id, name, role: name.split('(')[1]?.replace(')', '') || 'Analyst' })} />;
  }
  return children({ user, signOut: () => setUser(null) });
}

// Extra dashboard views: {id, label, short, Icon, render: ({ currentUser, asOfDate, notify }) => element}
export const views = [];

export function HeaderExtras() {
  return null;
}
