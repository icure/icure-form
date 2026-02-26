const { resolve } = require('path')
const rspack = require('@rspack/core')

module.exports = {
	mode: 'development',
	entry: {
		app: { import: './app/demo-app.ts', dependOn: ['codes'] },
		codes: { import: './app/codes.ts' },
		icure: { import: '@icure/cardinal-sdk', dependOn: ['dateFns'] },
		dateFns: 'date-fns',
	},
	plugins: [
		new rspack.HtmlRspackPlugin({
			template: 'index.html',
		}),
		new rspack.CopyRspackPlugin({
			patterns: [{ context: 'node_modules/@webcomponents/webcomponentsjs', from: '**/*.js', to: 'webcomponents' }],
		}),
	],
	devtool: 'source-map',
	module: {
		rules: [
			{
				test: /\.tsx?$/,
				exclude: /node_modules/,
				use: {
					loader: 'builtin:swc-loader',
					options: {
						jsc: {
							parser: {
								syntax: 'typescript',
								decorators: true,
							},
							transform: {
								legacyDecorator: true,
								decoratorMetadata: true,
							},
						},
					},
				},
			},
			{
				test: /\.yaml$/,
				type: 'asset/source',
			},
			{
				test: /\.s([ca])ss$/,
				use: [
					resolve(__dirname, 'lit-css-loader.js'),
					'sass-loader',
				],
				type: 'javascript/auto',
			},
			{
				test: /\.css$/,
				use: [
					resolve(__dirname, 'lit-css-loader.js'),
				],
				type: 'javascript/auto',
			},
			{
				test: /\.m?js/,
				resolve: {
					fullySpecified: false,
				},
			},
		],
	},
	resolve: {
		extensions: ['.tsx', '.ts', '.js'],
	},
	output: {
		filename: '[name].bundle.js',
		path: resolve(__dirname, 'dist'),
	},
	optimization: {
		runtimeChunk: 'single',
		splitChunks: {
			chunks: 'all',
		},
	},
}
