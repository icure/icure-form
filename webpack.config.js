// eslint-disable-next-line @typescript-eslint/no-var-requires
const HtmlWebpackPlugin = require('html-webpack-plugin')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const CopyWebpackPlugin = require('copy-webpack-plugin')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { resolve } = require('path')

module.exports = ({ mode }) => {
	return {
		mode: 'development',
		//entry: './app/demo-app.ts',
		entry: {
			app: { import: './app/demo-app.ts', dependOn: ['codes'] },
			codes: { import: './app/codes.ts' },
			icure: { import: '@icure/api', dependOn: ['lodash', 'dateFns', 'moment'] },
			lodash: 'lodash',
			dateFns: 'date-fns',
			moment: 'moment',
		},
		plugins: [
			new HtmlWebpackPlugin({
				template: 'index.html',
			}),
			new CopyWebpackPlugin({
				patterns: [{ context: 'node_modules/@webcomponents/webcomponentsjs', from: '**/*.js', to: 'webcomponents' }],
			}),
		],
		devtool: 'source-map',
		module: {
			rules: [
				{
					test: /\.tsx?$/,
					use: 'ts-loader',
					exclude: /node_modules/,
				},
				{
					test: /\.yaml$/,
					use: 'raw-loader',
					exclude: /node_modules/,
				},
				{
					test: /\.s([ca])ss$/,
					use: [
						{
							loader: 'lit-scss-loader',
							options: {
								minify: true, // defaults to false
							},
						},
						'sass-loader',
					],
				},
				{
					test: /\.css$/,
					use: [
						{
							loader: 'lit-scss-loader',
							options: {
								minify: true, // defaults to false
							},
						},
						'extract-loader',
						'css-loader',
					],
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
}
