const path = require("path");

module.exports = {
  entry: "./src/index.js",
  optimization: {
    minimize: true
  },
  target: "webworker",
  output: {
    filename: "index.js",
    path: path.resolve(__dirname, "bin"),
    libraryTarget: "this",
  },
  module: {
    rules: [
      {
        test: /\.(txt|html)/,
        type: "asset/source",
      },
    ],
  },
  plugins: [
  ],
};
