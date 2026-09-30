import React, { useState } from 'react';
import LandingPage from './components/LandingPage';
import Dashboard from './components/Dashboard';
import KeystoneIntro from './landing';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState({
    id: "p-priya",
    name: "Priya Menon (Ops Lead)",
    role: "Ops Lead"
  });

  const handleLaunchConsole = (roleId, roleName) => {
    if (roleId && roleName) {
      setCurrentUser({
        id: roleId,
        name: roleName,
        role: roleName.split('(')[1]?.replace(')', '') || "Analyst"
      });
    }
    setIsAuthenticated(true);
  };

  const handleSignOut = () => {
    setIsAuthenticated(false);
  };

  return (
    <div className="min-h-screen bg-ks-bg text-ks-text font-sans antialiased selection:bg-ks-orange/30 selection:text-ks-text">
      {isAuthenticated ? (
        <Dashboard 
          currentUser={currentUser} 
          onSignOut={handleSignOut} 
          onHome={handleSignOut}
        />
      ) : (
        <>
        <KeystoneIntro onLaunchConsole={handleLaunchConsole} />
        <LandingPage 
          onLaunchConsole={handleLaunchConsole} 
        />
        </>
      )}
    </div>
  );
}
