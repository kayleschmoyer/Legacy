"""Hello unit test module."""

from stats_lambda.hello import hello


def test_hello():
    """Test the hello function."""
    assert hello() == "Hello stats_lambda"
