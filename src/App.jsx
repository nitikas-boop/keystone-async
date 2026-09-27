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
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] font-sans antialiased selection:bg-[#E0F2FE] selection:text-[#0369A1]">
      {/* Floating Demo Mode Switcher for Judging Convenience */}
      <div className="fixed bottom-4 left-4 z-50">
        <button
          onClick={() => setIsAuthenticated(!isAuthenticated)}
          className="px-3 py-1.5 rounded-xl bg-white/95 backdrop-blur-md border border-slate-200 hover:border-sky-300 text-[11px] font-mono text-[#0F172A] hover:text-[#0284C7] shadow-md flex items-center gap-2 transition-all cursor-pointer"
        >
          <span className="w-2 h-2 rounded-full bg-[#0284C7]" />
          <span>Switch to: {isAuthenticated ? 'Public Landing Page' : 'Research Console'}</span>
        </button>
      </div>

      {isAuthenticated ? (
        <Dashboard 
          currentUser={currentUser} 
          onSignOut={handleSignOut} 
        />
      ) : (
        <LandingPage 
          onLaunchConsole={handleLaunchConsole} 
        />
      )}
    </div>
  );
}
