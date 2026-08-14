from service import format_name, legacy_format_name


def test_format_name() -> None:
    assert format_name(" ada ") == "Ada"


def test_legacy_format_name() -> None:
    assert legacy_format_name(" ada ") == "ADA"
