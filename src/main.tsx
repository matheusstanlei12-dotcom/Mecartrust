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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'monospace', background: '#f8f9fa' }}>
          <div style={{ background: 'white', padding: '30px', borderRadius: '15px', maxWidth: '600px', border: '2px solid #ff4d4f' }}>
            <h2 style={{ color: '#ff4d4f' }}>🚨 Erro de Renderização</h2>
            <div style={{ background: '#000', color: '#0f0', padding: '15px', borderRadius: '8px', fontSize: '12px', overflowX: 'auto' }}>
              {this.state.error}
            </div>
            <p style={{ marginTop: '15px', color: '#666' }}>
              Este erro ocorreu no componente React. Tente limpar o cache ou aguarde o deploy terminar.
            </p>
            <button onClick={() => window.location.reload()} style={{ padding: '10px 20px', cursor: 'pointer' }}>Forçar Recarregamento</button>
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
