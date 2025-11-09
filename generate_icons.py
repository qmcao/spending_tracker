import binascii
import struct
import zlib


def chunk(tag: bytes, data: bytes) -> bytes:
  return (
      struct.pack('>I', len(data))
      + tag
      + data
      + struct.pack('>I', binascii.crc32(tag + data) & 0xFFFFFFFF)
  )


def make_png(path: str, size: int, color: tuple[int, int, int]) -> None:
  width = height = size
  r, g, b = color
  row = bytes([0] + [r, g, b] * width)
  raw = row * height
  data = zlib.compress(raw)
  ihdr = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)
  with open(path, 'wb') as f:
    f.write(b'\x89PNG\r\n\x1a\n')
    f.write(chunk(b'IHDR', ihdr))
    f.write(chunk(b'IDAT', data))
    f.write(chunk(b'IEND', b''))


def main():
  make_png('icon-192.png', 192, (233, 170, 196))
  make_png('icon-512.png', 512, (201, 183, 255))


if __name__ == '__main__':
  main()
