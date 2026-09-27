import unittest
from PIL import Image, ImageDraw
import numpy as np
from ocr_regions import join_split_lines, choose_transcript, deskew_and_clean_image, suppress_duplicate_boxes, prepare_line_boxes
from essay_formatter import correct_domain_terms, format_essay_document


def box(top, bottom):
    return dict(x1=0, x2=400, y1=top, y2=bottom, height=bottom-top,
                centroid_y=(top+bottom)/2, conf=0.8)


class OcrRegionsTests(unittest.TestCase):
    def test_default_preserves_yolo_lines_even_when_ink_crosses_between_them(self):
        image = Image.new('RGB', (400, 150), 'white')
        draw = ImageDraw.Draw(image)
        for x in [40, 100, 180]:
            draw.rectangle((x, 20, x+8, 100), fill='black')
        boxes = [box(10, 65), box(60, 115)]
        self.assertEqual(len(prepare_line_boxes(image, boxes)), 2)
        self.assertEqual(len(prepare_line_boxes(image, boxes, repair_split_lines=True)), 1)

    def test_deskew_reduces_both_directions_of_tilt(self):
        image = Image.new('RGB', (500, 300), 'white')
        draw = ImageDraw.Draw(image)
        for y in [100, 125, 150, 175]:
            draw.rectangle((100, y, 400, y+5), fill='black')
        for angle in [-10, 10]:
            tilted = image.rotate(angle, fillcolor='white')
            corrected = deskew_and_clean_image(tilted)
            self.assertGreater(corrected.width, tilted.width)
            self.assertGreater(corrected.height, tilted.height)
            ys = np.where(np.asarray(corrected).mean(axis=2) < 80)[0]
            self.assertLess(int(ys.max()-ys.min()), 95)

    def test_variant_selection_does_not_drop_difficult_words(self):
        self.assertEqual(choose_transcript('Hello', 'Hello I Optim', 0.9, 0.6), 1)
        self.assertEqual(choose_transcript('Hello Analytics', 'Lollo Analytics', 0.9, 0.6), 0)
        self.assertEqual(choose_transcript('Hello I Optim', 'Hello', 0.6, 0.9), 0)
        self.assertEqual(choose_transcript('Hello', '', 0.0, 0.9), 0)
        self.assertEqual(choose_transcript('', 'Hello', 0.9, 0.0), 1)

    def test_side_by_side_regions_are_preserved(self):
        left = dict(box(10, 40), x1=0, x2=100)
        right = dict(box(10, 40), x1=200, x2=300)
        self.assertEqual(suppress_duplicate_boxes([right, left]), [left, right])

    def test_duplicates_are_suppressed_even_with_intervening_region(self):
        first = dict(box(10, 40), x1=0, x2=100, conf=0.9)
        other = dict(box(11, 41), x1=200, x2=300)
        duplicate = dict(box(12, 42), x1=1, x2=101, conf=0.7)
        self.assertEqual(suppress_duplicate_boxes([duplicate, other, first]), [first, other])

    def test_vertically_distinct_regions_are_preserved(self):
        self.assertEqual(len(suppress_duplicate_boxes([box(10, 40), box(35, 65)])), 2)

    def test_invalid_regions_are_rejected(self):
        self.assertEqual(suppress_duplicate_boxes([box(40, 40), dict(box(10, 40), x2=0)]), [])

    def test_split_glyphs_are_reunited(self):
        image = Image.new('RGB', (400, 150), 'white')
        draw = ImageDraw.Draw(image)
        for x in [40, 100, 180]:
            draw.rectangle((x, 20, x+8, 100), fill='black')
        result = join_split_lines(image, [box(10, 65), box(60, 115)])
        self.assertEqual(len(result), 1)
        self.assertEqual((result[0]['y1'], result[0]['y2']), (10, 115))

    def test_close_distinct_lines_are_not_merged(self):
        image = Image.new('RGB', (400, 150), 'white')
        draw = ImageDraw.Draw(image)
        for y in [20, 80]:
            for x in [40, 100, 180]:
                draw.rectangle((x, y, x+8, y+25), fill='black')
        self.assertEqual(len(join_split_lines(image, [box(10, 65), box(60, 115)])), 2)

    def test_ruling_does_not_merge_lines(self):
        image = Image.new('RGB', (400, 150), 'white')
        ImageDraw.Draw(image).line((0, 40, 399, 90), fill='black', width=3)
        self.assertEqual(len(join_split_lines(image, [box(10, 65), box(60, 115)])), 2)

    def test_formatting_does_not_invent_domain_content(self):
        for text in ['Quality education matters.', 'I love learning.', 'Ortam', 'Hollo']:
            self.assertEqual(correct_domain_terms(text), text)
            self.assertEqual(format_essay_document([{'text': text, 'bbox': [0, 0, 200, 30]}]), text)


if __name__ == '__main__':
    unittest.main()
