import http.client
import tempfile
import threading
import unittest
from pathlib import Path
from http.server import ThreadingHTTPServer
from server import handler_for, library


class PlayerServerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / 'Psalms').mkdir()
        (self.root / 'Psalms' / '001.mp3').write_bytes(b'0123456789')
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), handler_for(self.root))
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.temp.cleanup()

    def request(self, path, headers=None, method='GET'):
        client = http.client.HTTPConnection('127.0.0.1', self.server.server_port)
        client.request(method, path, headers=headers or {})
        response = client.getresponse()
        result = response.status, dict(response.getheaders()), response.read()
        client.close()
        return result

    def test_stream_ranges_and_seek(self):
        for value, expected in [('bytes=2-5',b'2345'),('bytes=7-',b'789'),('bytes=-3',b'789'),('bytes=8-99',b'89')]:
            status, headers, body = self.request('/audio/Psalms/001.mp3', {'Range':value})
            self.assertEqual(status,206)
            self.assertEqual(body,expected)
            self.assertEqual(int(headers['Content-Length']),len(expected))
        status, headers, body = self.request('/audio/Psalms/001.mp3', method='HEAD')
        self.assertEqual(status,200)
        self.assertEqual(headers['Content-Length'],'10')
        self.assertEqual(body,b'')

    def test_invalid_ranges(self):
        for value in ['bytes=99-','bytes=5-2','bytes=-0','bytes=','bytes=1-2,4-5']:
            self.assertEqual(self.request('/audio/Psalms/001.mp3', {'Range':value})[0],416)

    def test_traversal_and_symlink(self):
        (self.root/'Psalms'/'outside.mp3').symlink_to(Path(__file__).resolve())
        for path in ['/audio/../server.py','/audio/%2e%2e/server.py','/../server.py','/audio/Psalms/outside.mp3']:
            self.assertEqual(self.request(path)[0],404)

    def test_library_empty_missing_and_duplicates(self):
        self.assertEqual(library(self.root)['books']['Psalms']['1'],'/audio/Psalms/001.mp3')
        (self.root/'Psalms'/'Psalm 1.mp3').write_bytes(b'x')
        (self.root/'Psalms'/'track_19_002.mp3').write_bytes(b'x')
        result = library(self.root)
        self.assertIsNone(result['books']['Psalms']['1'])
        self.assertEqual(len(result['warnings']),2)
        self.assertEqual(result['books']['Genesis'],{})
        self.assertEqual(self.request('/api/library')[0],200)
        self.assertEqual(self.request('/')[0],200)


if __name__ == '__main__':
    unittest.main()
