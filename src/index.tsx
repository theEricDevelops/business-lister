import React from 'react';
import { createRoot } from 'react-dom/client';
import Businesses from './views/Businesses';
import './styles.css';

const App: React.FC = () => {
  return (
    <div>
      <Businesses />
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}