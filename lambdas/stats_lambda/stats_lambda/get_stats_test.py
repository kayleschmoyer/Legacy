from stats_lambda.get_stats import lambda_handler
import json


def run():
    print(
        lambda_handler(
            {"body": json.dumps({"game_date": "1957-06-02", "player_id": "mantlmi01"})},
            {},
        )
    )
