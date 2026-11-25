"""Convert a .glb to a self-contained glTF JSON file (buffer embedded as base64).
Artifact hosting serves .json but not .glb; GLTFLoader reads either."""
import sys, json, struct, base64
src, dst = sys.argv[1], sys.argv[2]
b = open(src, 'rb').read()
magic, ver, length = struct.unpack_from('<4sII', b, 0)
assert magic == b'glTF'
off, doc, binc = 12, None, b''
while off < length:
    clen, ctype = struct.unpack_from('<I4s', b, off)
    data = b[off + 8: off + 8 + clen]
    if ctype == b'JSON': doc = json.loads(data)
    elif ctype == b'BIN\x00': binc = data
    off += 8 + clen
doc['buffers'][0]['uri'] = 'data:application/octet-stream;base64,' + base64.b64encode(binc).decode()
json.dump(doc, open(dst, 'w'), separators=(',', ':'))
