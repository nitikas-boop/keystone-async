import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

// A render error inside one view shows here instead of unmounting the whole app (a blank page). The rest of the
// workspace (sidebar, header) keeps working; "Try again" re-renders the view, "Reload" reloads the page.
export default class ViewBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Keystone view crashed:', error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div role="alert" className={`paper-sheet p-5 m-4 flex flex-col gap-3 max-w-2xl ${this.props.full ? 'mx-auto mt-16' : ''}`}>
        <div className="flex items-center gap-2 font-heading font-semibold text-[14px] text-kb-alert">
          <AlertTriangle size={16} aria-hidden="true" /> {this.props.title || 'This view hit an error'}
        </div>
        <p className="text-[13px] text-kb-navy">Nothing was changed. The error was:</p>
        <pre className="text-[12px] bg-kb-bg-soft border border-kb-line rounded-lg p-2 whitespace-pre-wrap text-kb-navy">{String(error.message || error)}</pre>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary" onClick={() => this.setState({ error: null })}>Try again</button>
          <button type="button" className="btn-secondary" onClick={() => window.location.reload()}><RefreshCw size={13} /> Reload</button>
        </div>
      </div>
    );
  }
}
