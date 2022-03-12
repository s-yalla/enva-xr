const path = require('path');

module.exports = {
	mode: 'production',
	entry: './src/main.js',
	output: {
		filename: 'build.js',
		path: path.resolve(__dirname, 'build'),
	},
	module: {
		rules: [
			{
				test: /\.glsl$/i,
				use: "raw-loader"
			}
		]
	},
	optimization: {}
};