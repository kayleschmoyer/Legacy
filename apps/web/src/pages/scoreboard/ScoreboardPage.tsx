import React from 'react';
import { PageMeta } from '../../components/PageMeta';
import { Scoreboard } from '../../components/scoreboard/Scoreboard';

export function ScoreboardPage() {
  return (
    <>
      <PageMeta
        title="MLB Scoreboard"
        description="Live MLB game scores and linescore updates"
      />
      <Scoreboard />
    </>
  );
}
