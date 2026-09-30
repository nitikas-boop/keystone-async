import React, { useCallback, useEffect, useState } from 'react';
import { Bot, Building2, MessagesSquare, NotebookPen } from 'lucide-react';
import LandingPage from '../../components/LandingPage';
import * as p1 from '../../api/p1';
import AuthScreen from './AuthScreen';
import PairClaim from './PairClaim';
import MobileApprove from './MobileApprove';
import Chat from './Chat';
import AgentActions from './AgentActions';
import OrgAdmin from './OrgAdmin';
import Bell from './Bell';
import EmployeeDashboard from './EmployeeDashboard';

export { DemoSwitcher, JurisdictionDrawer, RestrictedAnswer } from './Jurisdiction';

// Person 1: sign-in (A), the access-aware user (B), chat and the bell (E), agent actions (E/G), the organisation
// page with plugins and linked devices (A, B, G, H), and the phone approval screen (H).
const READERS = new Set(['owner', 'compliance']);
const APPROVERS = new Set(['owner', 'lead', 'compliance']);
export const isEmployee = (me) => me?.role === 'member';
export const canApprove = (me) => APPROVERS.has(me?.role) && me?.via !== 'mcp';
const params = () => new URLSearchParams(window.location.search);

// The Dashboard's user shape, plus the full signed-in user as `p1` for Person 1's views.
function dashboardUser(me) {
  return { id: me.person_key || me.user_id, name: `${me.display_name} (${me.designation || me.role})`,
    role: me.designation || me.role, isReader: READERS.has(me.role), p1: me };
}

export function AuthGate({ children }) {
  const [me, setMe] = useState(undefined);  // undefined: checking the session; null: signed out
  const [screen, setScreen] = useState('landing');
  const [desktop, setDesktop] = useState(false);
  const pair = params().get('pair');

  // The signed-in user carries their permission map (GET /me/permissions) as me.perms.
  const signedIn = useCallback((u) => (u ? p1.permissions().then(perms => setMe({ ...u, perms }), () => setMe({ ...u, perms: null })) : setMe(u)), []);
  useEffect(() => { p1.me().then(signedIn, () => setMe(null)); }, [signedIn]);
  const signOut = useCallback(() => p1.logout().finally(() => { setMe(null); setScreen('landing'); setDesktop(false); }), []);

  if (me === undefined) return <div className="min-h-dvh flex items-center justify-center text-[13px] text-[#64748B]">Checking your session…</div>;
  if (pair && me?.via !== 'device') return <PairClaim token={pair} onDone={signedIn} onCancel={() => { window.history.replaceState(null, '', window.location.pathname); setMe(m => m); setScreen('login'); }} />;
  if (!me) {
    if (screen === 'pair') return <PairClaim onDone={signedIn} onCancel={() => setScreen('login')} />;
    if (screen === 'login') return <AuthScreen onSignedIn={signedIn} onBack={() => setScreen('landing')} />;
    return <LandingPage onLaunchConsole={() => setScreen(window.innerWidth < 768 ? 'pair' : 'login')} />;
  }
  const phone = me.via === 'device' || params().has('mobile') || window.innerWidth < 768;
  if (phone && !desktop) return <MobileApprove me={me} onSignOut={signOut} onDesktop={() => setDesktop(true)} />;
  return children({ user: dashboardUser(me), signOut });
}

// Extra dashboard views: {id, label, short, Icon, render: ({ currentUser, asOfDate, notify }) => element}
export const views = [
  { id: 'P1_CHAT', label: 'Chat', short: 'Chat', Icon: MessagesSquare,
    render: ({ currentUser, notify }) => <Chat me={currentUser.p1} notify={notify} /> },
  { id: 'P1_AGENT', label: 'Agent actions', short: 'Agent', Icon: Bot,
    render: ({ currentUser }) => <AgentActions me={currentUser.p1} /> },
  { id: 'P1_ORG', label: 'Admin', short: 'Admin', Icon: Building2, cap: 'admin.panel',
    render: ({ currentUser, notify }) => <OrgAdmin me={currentUser.p1} notify={notify} /> },
];

// An employee's workspace opens on their jurisdiction (My workspace) instead of Ask.
const EMPLOYEE_VIEW = { id: 'P1_MINE', label: 'My workspace', short: 'Mine', Icon: NotebookPen,
  render: ({ currentUser }) => <EmployeeDashboard me={currentUser.p1} /> };
export const viewsFor = (user) => (isEmployee(user?.p1) ? [EMPLOYEE_VIEW, ...views] : views);
export const homeView = (user) => (isEmployee(user?.p1) ? EMPLOYEE_VIEW.id : undefined);

export function HeaderExtras() {
  return <Bell />;
}
