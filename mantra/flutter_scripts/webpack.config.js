// webpack.config.js
const path = require("path");
const webpack = require("webpack");

module.exports = {
  entry: "./signTransaction.ts",
  target: "web",
  mode: "production",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "signTransaction.bundle.js"
  },
  resolve: {
    extensions: [".ts", ".js"],
    fallback: {
      buffer: require.resolve("buffer/"),
      stream: require.resolve("stream-browserify"),
      crypto: require.resolve("crypto-browserify"),
      process: require.resolve("process/browser"),
      vm: require.resolve("vm-browserify"),
    },
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
    ],
  },
  plugins: [
    new webpack.ProvidePlugin({
      process: "process/browser",
      Buffer: ["buffer", "Buffer"],
    }),
  ],
};
