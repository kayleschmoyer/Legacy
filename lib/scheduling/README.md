# @legacy-sports/scheduling

Matchup scheduling algorithms for fantasy leagues.

## Features

- **Season Selection**: Automatically select eligible seasons based on league configuration
- **Multiple Strategies**: Round-robin, divisional, and random scheduling
- **Team Balancing**: Handle even and odd number of teams
- **Home/Away Fairness**: Ensure balanced home/away matchups over the season

## Usage

```typescript
import { MatchupScheduler, RoundRobinStrategy } from '@legacy-sports/scheduling';

const scheduler = new MatchupScheduler(new RoundRobinStrategy());
const schedule = scheduler.generateSchedule({
  teams: [...],
  numberOfWeeks: 14,
  leagueConfig: {...}
});
```

## Strategies

### Round Robin
Each team plays every other team exactly once during the season.

### Divisional  
Teams play division opponents more frequently than non-division opponents.

### Random
Random matchups each week (avoiding duplicate matchups in same week).
