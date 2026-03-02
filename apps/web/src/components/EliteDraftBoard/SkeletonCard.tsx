import React from 'react';

// ---------------------------------------------------------------------------
// Skeleton Card (loading placeholder)
// ---------------------------------------------------------------------------

export function SkeletonCard({ delay }: { delay: number }) {
  return (
    <div className="d-skel-card" style={{ animationDelay: `${delay}s` }}>
      <div
        className="d-skel-line"
        style={{ width: '55%', height: 18, marginBottom: 8 }}
      />
      <div
        className="d-skel-line"
        style={{ width: '35%', height: 13, marginBottom: 16 }}
      />
      <div
        className="d-skel-line"
        style={{ width: '100%', height: 54, marginBottom: 10 }}
      />
      <div
        className="d-skel-line"
        style={{ width: '100%', height: 30, marginBottom: 10 }}
      />
      <div className="d-skel-line" style={{ width: '100%', height: 36 }} />
    </div>
  );
}
