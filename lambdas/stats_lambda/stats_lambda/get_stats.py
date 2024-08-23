import re
from pybaseball import playerid_lookup
import datetime
import json
import pandas as pd

from pybaseball.datasources.bref import BRefSession
from bs4 import BeautifulSoup

session = BRefSession()

def read_from_bref(bref_id: str, year: int): 
    url = f"https://www.baseball-reference.com/players/gl.fcgi?id={bref_id}&t=b&year={year}"
    s = session.get(url).content
    # a workaround to avoid beautiful soup applying the wrong encoding
    s = s.decode('utf-8')
    return BeautifulSoup(s, features="lxml")

def get_table(soup: BeautifulSoup): 
    table = soup.find('table', {'id': 'batting_gamelogs'})
    data = []
    headings = [th.get_text() for th in table.find("tr").find_all("th")][1:]
    headings.append("mlbID")
    data.append(headings)
    table_body = table.find('tbody')
    rows = table_body.find_all('tr')
    for row in rows:
        cols = row.find_all('td')
        row_anchor = row.find("a")
        mlbid = row_anchor["href"].split("mlb_ID=")[-1] if row_anchor else pd.NA  # ID str or nan
        cols = [ele.text.strip() for ele in cols]
        cols.append(mlbid)
        data.append([ele for ele in cols])
    df = pd.DataFrame(data)
    df = df.rename(columns=df.iloc[0])
    df = df.reindex(df.index.drop(0))
    return df

def get_game_logs(player_id: str, year: int) -> pd.DataFrame:
    soup = read_from_bref(player_id, year)
    table = get_table(soup)

    table = table.dropna(how='all')  # drop if all columns are NA
    # scraped data is initially in string format.
    # convert the necessary columns to numeric.
    for column in ["Gcar",	"PA",	"AB",	"R", "H",	"2B", "3B",	"HR",	"RBI",	"BB",	"IBB",	"SO",	"HBP",	"SH",	"SF",	"ROE",	"GDP",	"SB",	"CS",	"BA",	"OBP",	"SLG",	"OPS",	"BOP",	"aLI",	"WPA",	"acLI",	"RE24"]:
        table[column] = pd.to_numeric(table[column])
    table = table.drop('', axis=1)
    
    return table


def lambda_handler(event, context):
    print(f"event {event}") # debug print
    body = json.loads(event.get('body'))
    
    game_date = body.get('game_date')
    fname = body.get('first_name')
    lname = body.get('last_name')
    print(f"Fetching stats for {fname} {lname} on date {game_date}")
    
    date: datetime.datetime = datetime.date.fromisoformat(game_date)
    

    player = playerid_lookup(lname, fname)

    player_id = player['key_bbref'][0]

    logs = get_game_logs(player_id=player_id, year=date.year)


    query = f"Date.str.match('{date.strftime("%b")} {date.day}( \\\\(\\\\d+\\\\))?$')"
    log = logs.query(query)


    result = log.to_dict()

    print(result)

    return {
            'statusCode': 200,
            'headers': {
               'Access-Control-Allow-Origin': '*',
               'Access-Control-Allow-Methods': '*',
               'Access-Control-Allow-Headers': '*'
            },
            'body': result
        }
   