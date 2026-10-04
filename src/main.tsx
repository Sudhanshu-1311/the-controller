import {createRoot} from 'react-dom/client';
import './services/android-bridge';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(<App />);
