import React from 'react';
import Dashboard from './components/Dashboard';
import * as P1 from './features/p1';
import * as P2 from './features/p2';

// Commit 0 wiring (KEYSTONE-BUILD-SPLIT.md section 4): Person 1 owns sign-in (AuthGate) and its views, Person 2
// its views. Each edits only its own features/pN/index.jsx; this file does not change again.
export default function App() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] font-sans antialiased selection:bg-[#E0F2FE] selection:text-[#0369A1]">
      <P1.AuthGate>
        {({ user, signOut }) => (
          <Dashboard
            currentUser={user}
            onSignOut={signOut}
            onHome={signOut}
            extraViews={[...P1.viewsFor(user), ...P2.views]}
            initialView={P1.homeView(user)}
            canApprove={P1.canApprove(user.p1)}
            employee={P1.isEmployee(user.p1)}
            userSwitcher={(name) => <P1.DemoSwitcher me={user.p1} fallback={name} />}
            headerExtras={<>{P2.HeaderWidget && <P2.HeaderWidget currentUser={user} />}<P1.HeaderExtras user={user} /></>}
          />
        )}
      </P1.AuthGate>
    </div>
  );
}
