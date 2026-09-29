import { createContext, useContext } from 'react';

// App-wide state the screens share: who is viewing, the name directory, and navigation to any record by ID.
export const AppContext = createContext({
  userKey: 'priya',
  isReader: false,
  team: [],
  openEntity: () => {},
  notify: () => {},
});

export const useApp = () => useContext(AppContext);
