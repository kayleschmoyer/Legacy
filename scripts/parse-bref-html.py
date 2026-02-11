#!/usr/bin/env python3
"""Parse Baseball-Reference HTML to extract game identifiers."""

from bs4 import BeautifulSoup
import sys

def parse_gamelog_html(filepath):
    """Parse the gamelog HTML file and extract game data."""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    soup = BeautifulSoup(content, 'html.parser')
    
    # First, see what tables we have
    all_tables = soup.find_all('table')
    print(f"Found {len(all_tables)} tables in the document")
    for table in all_tables:
        table_id = table.get('id', 'NO_ID')
        print(f"  - Table id: {table_id}")
    print()
    
    # Find the batting gamelogs table
    table = soup.find('table', {'id': 'players_standard_batting'})
    
    if not table:
        print("ERROR: Table with id='players_standard_batting' not found")
        return
    
    print(f"✓ Found table: {table.get('id')}")
    
    # Find all rows
    all_rows = table.find_all('tr')
    print(f"✓ Found {len(all_rows)} total rows in table")
    
    # Look for data rows (skip header rows)
    data_rows = []
    for row in all_rows:
        # Skip header rows
        if 'thead' in row.get('class', []) or row.find('th', {'scope': 'col'}):
            continue
        # Look for rows with actual data cells
        cells = row.find_all(['th', 'td'])
        if cells and len(cells) > 5:  # Must have multiple columns
            data_rows.append(row)
    
    print(f"✓ Found {len(data_rows)} data rows\n")
    
    print(f"✓ Found {len(data_rows)} data rows\n")
    
    # Extract first 10 games to examine structure
    print("First 10 games with all available data:")
    print("-" * 80)
    
    for i, row in enumerate(data_rows[:10]):
        # Get ALL cells with data-stat attributes
        all_cells = row.find_all(['th', 'td'], attrs={'data-stat': True})
        
        # Create a dictionary of stat_name -> value
        game_data = {}
        for cell in all_cells:
            stat_name = cell.get('data-stat')
            stat_value = cell.get_text(strip=True)
            csk = cell.get('csk', None)
            
            # Check for links that might contain game identifiers
            link = cell.find('a')
            href = link.get('href') if link else None
            
            # Store the value, csk, and any href
            cell_data = {'value': stat_value}
            if csk:
                cell_data['csk'] = csk
            if href:
                cell_data['href'] = href
            
            game_data[stat_name] = cell_data
        
        print(f"\nGame {i+1}:")
        
        # Show key fields that would identify the game
        identifier_fields = ['ranker', 'player_game_num_career', 'team_game_num_season', 
                            'date', 'team_name_abbr', 'game_location', 'opp_name_abbr', 
                            'game_result']
        
        print("  IDENTIFIER FIELDS:")
        for field in identifier_fields:
            if field in game_data:
                data = game_data[field]
                value = data['value'] if data['value'] else '(empty)'
                extra_info = []
                if 'csk' in data:
                    extra_info.append(f"csk={data['csk']}")
                if 'href' in data:
                    extra_info.append(f"href={data['href']}")
                
                if extra_info:
                    print(f"    {field}: '{value}' ({', '.join(extra_info)})")
                else:
                    print(f"    {field}: '{value}'")
        
        # Show sample stat fields
        stat_fields = ['b_ab', 'b_h', 'b_rbi']
        print("  STAT FIELDS:")
        for field in stat_fields:
            if field in game_data:
                print(f"    {field}: {game_data[field]['value']}")
        
        # Check if there's a boxscore field (game identifier!)
        if 'boxscore' in game_data or 'date_game' in game_data:
            print("  GAME IDENTIFIER CHECK:")
            if 'boxscore' in game_data:
                box = game_data['boxscore']
                print(f"    boxscore: {box.get('value', 'N/A')} (href={box.get('href', 'N/A')})")
            if 'date_game' in game_data:
                date = game_data['date_game']
                print(f"    date_game csk: {date.get('csk', 'N/A')}")

if __name__ == '__main__':
    filepath = 'tmp/sample_bref_file.html'
    parse_gamelog_html(filepath)
