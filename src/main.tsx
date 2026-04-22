import { StrictMode, Component } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// ErrorBoundary para capturar erros e evitar tela branca
class ErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean; error: string }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }

  componentDidCatch(error: Error, info: any) {
    console.error('💥 Erro React capturado:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'sans-serif', background: '#f0f2f5' }}>
          <div style={{ background: 'white', padding: '40px', borderRadius: '20px', textAlign: 'center', maxWidth: '400px' }}>
            <div style={{ fontSize: '3rem' }}>⚠️</div>
            <h2 style={{ color: '#e74c3c' }}>Algo deu errado</h2>
            <p style={{ color: '#666' }}>Aguarde um momento e recarregue a página.</p>
            <button 
              onClick={() => window.location.reload()} 
              style={{ marginTop: '20px', padding: '12px 24px', background: '#25d366', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold' }}
            >
              🔄 Recarregar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
