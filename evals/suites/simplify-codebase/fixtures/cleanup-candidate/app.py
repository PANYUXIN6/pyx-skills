from service import format_name


def greeting(name: str) -> str:
    return f"Hello, {format_name(name)}"
