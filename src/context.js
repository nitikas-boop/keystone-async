import { createContext, useContext } from 'react';

// App-wide state the screens share: who is viewing, the name directory, and navigation to any record by ID.
export const AppContext = createContext({
  userKey: 'priya',
  isReader: false,
  canApprove: true,  // owner, lead or compliance in a browser session (the backend enforces it either way)
  team: [],
  openEntity: () => {},
  notify: () => {},
});

export const useApp = () => useContext(AppContext);
