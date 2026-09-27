import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException
from local_ocr import require_local_ocr


class LocalOcrTests(unittest.TestCase):
    def request(self, host='127.0.0.1', origin='http://localhost:3000'):
        return SimpleNamespace(client=SimpleNamespace(host=host), headers={'origin': origin})

    def test_disabled_by_default(self):
        with patch.dict('os.environ', {'LOCAL_OCR_ENABLED': '0'}):
            with self.assertRaises(HTTPException):
                require_local_ocr(self.request())

    @patch.dict('os.environ', {'LOCAL_OCR_ENABLED': '1'})
    def test_only_loopback_and_local_origins_are_allowed(self):
        require_local_ocr(self.request())
        require_local_ocr(self.request('::1'))
        for request in (self.request('192.168.1.5'), self.request(origin='https://example.com')):
            with self.assertRaises(HTTPException):
                require_local_ocr(request)


if __name__ == '__main__':
    unittest.main()
