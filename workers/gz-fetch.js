/* MEO Notes – the large engine files ship gzip-compressed (so every file stays small
 * enough for GitHub's web uploader). This makes fetch() of vendor/*.wasm or *.data
 * transparently load and unpack the matching .gz file. */
(() => {
  if (self.__meoGz) return; self.__meoGz = true;
  const realFetch = self.fetch.bind(self);
  const BIG = /\/vendor\/.+\.(wasm|data)$/;
  async function gunzip(buf) {
    const u8 = new Uint8Array(buf);
    if (u8[0] !== 0x1f || u8[1] !== 0x8b) return buf; // server already unpacked it
    return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  }
  self.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const abs = new URL(url, self.location.href);
    if (BIG.test(abs.pathname)) {
      const res = await realFetch(abs.href + '.gz', init);
      if (res.ok) {
        const body = await gunzip(await res.arrayBuffer());
        const type = abs.pathname.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream';
        return new Response(body, { status: 200, headers: { 'Content-Type': type } });
      }
    }
    return realFetch(input, init);
  };
})();
