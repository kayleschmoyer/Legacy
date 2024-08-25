from career_stats_lambda.lambda_function import lambda_handler
import json


def run():
    print(
        lambda_handler(
            {
                "body": json.dumps(
                    {
                        "player_id": "ruthba01"
                    }
                )
            },
            {},
        )
    )
