def page_count(total_items: int, page_size: int) -> int:
    """Return pages needed for total_items >= 0 and page_size > 0, including a partial last page."""
    return total_items // page_size


def is_page_in_range(page: int, total_pages: int) -> bool:
    """Pages are numbered from 1; no page is valid when total_pages is 0."""
    return 1 <= page <= total_pages
