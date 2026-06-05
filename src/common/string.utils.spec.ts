import { removeVietnameseAccents, extractTitleFromUrl } from './string.utils';

describe('String Utilities', () => {
  describe('removeVietnameseAccents', () => {
    it('should remove accents and lowercase the input', () => {
      expect(removeVietnameseAccents('Tiếng Việt có dấu')).toBe(
        'tieng viet co dau',
      );
      expect(removeVietnameseAccents('ĐƯỜNG DẪN')).toBe('duong dan');
      expect(removeVietnameseAccents('shs-toan-5-tap-mot')).toBe(
        'shs-toan-5-tap-mot',
      );
    });

    it('should return empty string if input is empty', () => {
      expect(removeVietnameseAccents('')).toBe('');
    });
  });

  describe('extractTitleFromUrl', () => {
    it('should extract title from standard taphuan URL', () => {
      const url =
        'https://taphuan.nxbgd.vn/tap-huan/doc-sach/shs-toan-5-tap-mot.123456';
      expect(extractTitleFromUrl(url)).toBe('shs-toan-5-tap-mot');
    });

    it('should extract title from URL without numeric suffix', () => {
      const url =
        'https://taphuan.nxbgd.vn/tap-huan/doc-sach/shs-tieng-viet-5-tap-hai';
      expect(extractTitleFromUrl(url)).toBe('shs-tieng-viet-5-tap-hai');
    });

    it('should handle percent-encoded URLs', () => {
      const url = 'https://example.com/doc-sach/sach%20toan%20lop%205.123';
      expect(extractTitleFromUrl(url)).toBe('sach toan lop 5');
    });

    it('should fallback gracefully if URL format is unusual', () => {
      const url = 'simple-file-name.123';
      expect(extractTitleFromUrl(url)).toBe('simple-file-name');
    });
  });
});
