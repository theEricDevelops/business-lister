import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import Businesses from './views/Businesses';
import BusinessDetail from './views/BusinessDetail';
import './styles/main.css';

const App: React.FC = () => {
  return (
    <Router>
      <div className="app">
        <Routes>
          <Route path="/" element={<Businesses />} />
          <Route path="/business/:id" element={<BusinessDetail />} />
        </Routes>
      </div>
    </Router>
  );
};

export default App;