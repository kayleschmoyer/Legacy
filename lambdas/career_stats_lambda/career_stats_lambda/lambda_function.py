import json
from typing import Final
import requests

from bs4 import BeautifulSoup, Tag, NavigableString, Comment

session = requests.session()

NUMERIC_STATS: Final = [
    "G",
    "PA",
    "AB",
    "R",
    "H",
    "2B",
    "3B",
    "HR",
    "RBI",
    "SB",
    "CS",
    "BB",
    "SO",
    "batting_avg",
    "onbase_perc",
    "slugging_perc",
    "onbase_plus_slugging",
    "onbase_plus_slugging_plus",
    "TB",
    "GIDP",
    "HBP",
    "SH",
    "SF",
    "IBB",
]


def read_from_bref(bref_id: str):
    url = f"https://www.baseball-reference.com/players/{bref_id[0]}/{bref_id}.shtml#all_standard_fielding"
    s = session.get(url).content
    # a workaround to avoid beautiful soup applying the wrong encoding
    s = s.decode("utf-8")
    return BeautifulSoup(s, "html.parser")


def get_table(soup: BeautifulSoup, table_id: str):
    table = soup.find("table", {"id": table_id})

    if table is not None:
        return table

    # The table may be stored in a comment. Check for it
    comments = soup.find_all(text=lambda text: isinstance(text, Comment))

    for comment in comments:
        text: str = comment.string

        if table_id not in text:
            continue

        soup2 = BeautifulSoup(text, "html.parser")
        table = get_table(soup2, table_id)

        if table is not None:
            return table

    return None


def get_table_footer(table: Tag | NavigableString | None):
    return table.find("tfoot")


def parse_row(row: Tag | NavigableString | None):
    cols = row.find_all("td")

    stats = {}

    for col in cols:
        stat = col["data-stat"]
        text = col.text.strip()
        stats[stat] = float(text) if stat in NUMERIC_STATS and text != "" else text

    return stats


def parse_table(table):
    if table is None:
        return None

    footer = get_table_footer(table)
    row = footer.find("tr")
    data = parse_row(row)
    return data


def get_batting_stats(soup: BeautifulSoup):
    batting_stats = get_table(soup, "batting_standard")
    return parse_table(batting_stats)


def get_fielding_stats(soup: BeautifulSoup):
    fielding_stats = get_table(soup, "standard_fielding")

    if fielding_stats is None:
        return None

    footer = get_table_footer(fielding_stats)

    # Fielding stats are formatted differently
    for row in footer.find_all("tr"):
        cell = row.find_next(attrs={"data-stat": "pos"})

        if cell.text.strip() != "TOT":
            continue

        data = parse_row(row)
        return data

    return None


def get_pitching_stats(soup: BeautifulSoup):
    pitching_stats = get_table(soup, "pitching_standard")
    return parse_table(pitching_stats)


def get_career_stats(player_id: str):
    soup = read_from_bref(player_id)

    return {
        "batting": get_batting_stats(soup),
        "pitching": get_pitching_stats(soup),
        "fielding": get_fielding_stats(soup),
    }


def lambda_handler(event, context):
    print(f"event {event}")  # debug print

    if event.get("httpMethod") == "OPTIONS":
        return {
            "statusCode": 200,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
                "Access-Control-Allow-Headers": "*",
            },
        }

    body = json.loads(event.get("body"))
    player_id = body.get("player_id")
    print(f"Fetching career stats for {player_id}")

    result = get_career_stats(player_id)

    print(result)

    return {
        "statusCode": 200,
        "headers": {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*",
        },
        "body": json.dumps(result),
    }
