/* Join compatible constant-bitrate MP3 frames without decoding them into PCM. */
(function (root) {
  const rates = [44100, 48000, 32000];
  const mpeg1Rates = [0,32,40,48,56,64,80,96,112,128,160,192,224,256,320];
  const lowRates = [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160];

  function tagAt(bytes, at, tag) {
    return [...tag].every((char, i) => bytes[at + i] === char.charCodeAt(0));
  }

  function frames(buffer) {
    const bytes = new Uint8Array(buffer);
    let start = 0, end = bytes.length;
    if (tagAt(bytes, 0, 'ID3')) {
      if (end < 10 || bytes.subarray(6, 10).some(byte => byte > 127)) return null;
      start = 10 + ((bytes[6] << 21) | (bytes[7] << 14) | (bytes[8] << 7) | bytes[9]);
      if (bytes[3] === 4 && (bytes[5] & 16)) start += 10;
    }
    if (tagAt(bytes, end - 128, 'TAG')) end -= 128;
    const mpeg = (bytes[start + 1] >> 3) & 3;
    const mpeg1 = mpeg === 3;
    const rate = rates[(bytes[start + 2] >> 2) & 3] / (mpeg1 ? 1 : mpeg === 2 ? 2 : 4);
    const bitrate = (mpeg1 ? mpeg1Rates : lowRates)[bytes[start + 2] >> 4];
    const mono = (bytes[start + 3] >> 6) === 3;
    if (!rate || !bitrate || mpeg === 1 || end - start < 4) return null;
    const frameBytes = Math.floor((mpeg1 ? 144000 : 72000) * bitrate / rate);
    const sideInfo = start + ((bytes[start + 1] & 1) ? 4 : 6);
    const info = sideInfo + (mpeg1 ? (mono ? 17 : 32) : (mono ? 9 : 17));
    // A file-level seek table would describe just the first chapter of the joined source.
    if (tagAt(bytes, info, 'Xing') || tagAt(bytes, info, 'Info') || tagAt(bytes, start + 36, 'VBRI')) return null;
    // Each chapter must begin with an independent frame.
    if (bytes[sideInfo] || (mpeg1 && (bytes[sideInfo + 1] & 128))) return null;
    let count = 0;
    for (let at = start; at < end; count++) {
      if (at + 4 > end || bytes[at] !== 255 || (bytes[at + 1] & 254) !== (0xe2 | (mpeg << 3)) ||
          (bytes[at + 2] & 252) !== (bytes[start + 2] & 252) || ((bytes[at + 3] >> 6) === 3) !== mono) return null;
      at += frameBytes + ((bytes[at + 2] >> 1) & 1);
      if (at > end) return null;
    }
    return {data: bytes.subarray(start, end), seconds: count * (mpeg1 ? 1152 : 576) / rate, format: [mpeg, rate, bitrate, mono].join('/')};
  }

  root.MP3 = {frames};
  if (typeof module !== 'undefined') module.exports = root.MP3;
})(globalThis);
