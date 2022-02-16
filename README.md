# irb.wasm

IRB on browser powered by WebAssembly.
You can try irb.wasm on your browser. It works on CRuby ported to WebAssembly.

Demo: https://irb-wasm.vercel.app/

<div align="center">
<img src=./docs/demo.png width="400px">
</div>

## Dependencies

- [wasi-vfs](https://github.com/kateinoigakukun/wasi-vfs/): Only CLI tool is required

## Development

```console
$ make static/irb.wasm
$ npm install
$ npx parcel ./src/index.html
```

