import unittest

from calc import clamp


class ClampTests(unittest.TestCase):
    def test_value_inside_range_is_preserved(self):
        self.assertEqual(clamp(5, 0, 10), 5)

    def test_value_above_range_uses_upper_bound(self):
        self.assertEqual(clamp(20, 0, 10), 10)


if __name__ == "__main__":
    unittest.main()
