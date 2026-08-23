import React from 'react';
import { Route, Routes, Navigate } from 'react-router-dom';
import { Button } from '@mini/lib';
import { lazyWithRetry } from '../lazy';

const AboutPage = lazyWithRetry(() => import('../pages/about/AboutPage'));
const DraftPage = lazyWithRetry(() =>
  import('../pages/draft/DraftPage').then((m) => ({ default: m.DraftPage })),
);

function HomeScreen() {
  return <AboutTeaser />;
}

const AboutTeaser = () => <AboutPage />;

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeScreen />} />
      <Route path="/home" element={<Navigate to="/" replace />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/league/:id/draft" element={<DraftPage />} />
      <Route path="*" element={<AboutPage />} />
    </Routes>
  );
}
export const keep = Button;
