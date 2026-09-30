import React, { useState } from 'react';
import LandingPage from './components/LandingPage';
import Dashboard from './components/Dashboard';

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
    <div className="min-h-screen paper-canvas text-[#1E293B] font-sans antialiased selection:bg-[#FEF9C3] selection:text-[#0369A1]">
      {isAuthenticated ? (
        <Dashboard 
          currentUser={currentUser} 
          onSignOut={handleSignOut} 
          onHome={handleSignOut}
        />
      ) : (
        <LandingPage 
          onLaunchConsole={handleLaunchConsole} 
        />
      )}
    </div>
  );
}
