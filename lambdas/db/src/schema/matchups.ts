import { builder } from './builder';

// Define a basic Matchup type for now
const Matchup = builder.objectRef<{
  id: number;
  weekNumber: number;
  leagueId: number;
  numberOfGames: number;
}>('Matchup');

builder.objectType(Matchup, {
  description: 'A matchup between teams in a league',
  fields: (t) => ({
    id: t.exposeID('id'),
    weekNumber: t.exposeInt('weekNumber'),
    leagueId: t.exposeInt('leagueId'),
    numberOfGames: t.exposeInt('numberOfGames'),
  }),
});
