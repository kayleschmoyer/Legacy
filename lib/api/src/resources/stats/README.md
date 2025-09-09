# Statistics GraphQL Operations

This directory contains all GraphQL operations related to baseball statistics, organized by category:

## 📊 Statistics Categories

- **`batting/`** - Batting statistics (season and career)
- **`fielding/`** - Fielding/defense statistics (season and career)
- **`pitching/`** - Pitching statistics (season and career)

## 🎯 Organization Pattern

Each statistics category follows the same structure:

- `*.fragment.graphql` - Reusable field fragments
- `getPlayer*.query.graphql` - Queries for individual player stats
- `README.md` - Documentation for that category

## 🔍 Common Queries

- **Season Stats**: Get stats for a specific player, season, and team
- **Career Stats**: Get aggregated career statistics for a player
- **All Season Stats**: Get all seasons for a player in a category

## Usage

Import the specific fragments and queries you need from the appropriate subdirectory based on the type of statistics you're working with.
