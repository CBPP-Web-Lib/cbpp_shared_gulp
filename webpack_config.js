module.exports = {
  watch:true,
  watchOptions: {
    ignored: /(.*?)node_modules\/((?!cbpp_).*)/,
  },
  module: {
    rules: [
      { test: /\.css$/, use: ['style-loader', 'css-loader']},
      { test: /\.html$/, use: 'raw-loader' },
      //{ test: /_commonJS.js/, use: "imports-loader?define=>false" },
      {
        test: /\.scss$/,
        use: [
            "style-loader",
            "css-loader",
            "sass-loader"
        ]
      },
      {
        test: /\.(ttf|eot|woff|woff2|svg|png|gif|jpeg|jpg)$/,
        use: {
          loader: "file-loader",
          options: {
            outputPath: "../css_assets",
            name: "[name].[ext]",
            publicPath: 'css_assets'
          }
        }
      }
    ]
  }
};