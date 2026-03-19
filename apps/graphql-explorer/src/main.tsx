import { createRoot } from 'react-dom/client';
import { App } from './App';
import './main.css';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Could not find root element');
}

const root = createRoot(rootEl);
root.render(<App />);
