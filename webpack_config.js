module.exports = {
  watch:true,
  watchOptions: {
    ignored: /(.*?)node_modules\/((?!cbpp_).*)/,
  },
  module: {
    rules: [
      { test: /\.css$/, use: ['style-loader', 'css-loader']},
      { test: /\.html$/, use: 'raw-loader' },
      {
        test: /\.scss$/,
        use: [
            "style-loader",
            "css-loader",
            "sass-loader"
        ]
      }
    ]
  }
}