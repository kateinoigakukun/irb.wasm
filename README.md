# irb.wasm

IRB on browser powered by WebAssembly.
You can try irb.wasm on your browser. It works on CRuby ported to WebAssembly.

Demo: https://irb-wasm.vercel.app/

<div align="center">
<img src=./docs/demo.png width="400px">
</div>

## Development

```console
$ rake static/irb.wasm
$ npm install
$ npx parcel ./src/index.html
```

### Clean build

If you need to re-build Ruby itself (when you made a change to Ruby), clean `rubies` and `build` directories by `rake clean`, then re-execute `rake static/irb.wasm`

