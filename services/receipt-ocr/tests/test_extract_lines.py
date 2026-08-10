import unittest

from app.extract import extract_lines


class FakeResult:
    def __init__(self, payload):
        self.json = {"res": payload}


class ExtractLinesTests(unittest.TestCase):
    def test_maps_text_scores_and_polygons(self):
        result = FakeResult(
            {
                "rec_texts": ["Nasi Goreng", "25.000"],
                "rec_scores": [0.98, 0.91],
                "rec_polys": [
                    [[10, 20], [100, 20], [100, 40], [10, 40]],
                    [[200, 20], [280, 20], [280, 40], [200, 40]],
                ],
            }
        )
        lines = extract_lines([result])
        self.assertEqual([line["text"] for line in lines], ["Nasi Goreng", "25.000"])
        self.assertEqual(lines[0]["poly"][0], [10.0, 20.0])

    def test_converts_boxes_when_polygons_are_missing(self):
        result = FakeResult(
            {
                "rec_texts": ["TOTAL"],
                "rec_scores": [0.88],
                "rec_boxes": [[10, 30, 200, 60]],
            }
        )
        self.assertEqual(
            extract_lines([result])[0]["poly"],
            [[10.0, 30.0], [200.0, 30.0], [200.0, 60.0], [10.0, 60.0]],
        )


if __name__ == "__main__":
    unittest.main()
