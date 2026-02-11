#!/usr/bin/env python3
"""Check which data-stat attribute Baseball-Reference uses for game dates."""

from html.parser import HTMLParser
import sys

class BRefGameLogParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.date_attrs = []
        self.in_game_row = False
        
    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        data_stat = attrs_dict.get('data-stat', '')
        
        # Look for date-related data-stat attributes in table cells
        if tag == 'td' and data_stat in ['date', 'date_game']:
            self.date_attrs.append({
                'attribute': data_stat,
                'href': attrs_dict.get('href', 'N/A')
            })

if __name__ == '__main__':
    file_path = sys.argv[1] if len(sys.argv) > 1 else 'tmp/sample_bref_file.html'
    
    with open(file_path, 'r', encoding='utf-8') as f:
        html_content = f.read()
    
    parser = BRefGameLogParser()
    parser.feed(html_content)
    
    print(f"Found {len(parser.date_attrs)} date cells")
    print("\nFirst 5 date cells:")
    for i, attr in enumerate(parser.date_attrs[:5], 1):
        print(f"  {i}. data-stat=\"{attr['attribute']}\"")
    
    # Count by type
    date_count = sum(1 for a in parser.date_attrs if a['attribute'] == 'date')
    date_game_count = sum(1 for a in parser.date_attrs if a['attribute'] == 'date_game')
    
    print(f"\nSummary:")
    print(f"  'date': {date_count}")
    print(f"  'date_game': {date_game_count}")
    
    if date_count > 0 and date_game_count == 0:
        print("\n✅ Using NEW format (data-stat=\"date\")")
    elif date_game_count > 0 and date_count == 0:
        print("\n⚠️  Using OLD format (data-stat=\"date_game\")")
    elif date_count > 0 and date_game_count > 0:
        print("\n🔀 Using MIXED format (both attributes present)")
    else:
        print("\n❌ No date attributes found")
