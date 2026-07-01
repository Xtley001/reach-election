import { Component } from 'react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', marginBottom: '12px' }}>
          Something went wrong
        </h2>
        <p style={{ color: 'var(--text-2)', marginBottom: '24px' }}>
          {this.state.error.message}
        </p>
        <button
          className="btn btn-primary btn-md"
          onClick={() => window.location.reload()}
        >
          Reload page
        </button>
      </div>
    );
    return this.props.children;
  }
}
