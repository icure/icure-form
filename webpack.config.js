// eslint-disable-next-line @typescript-eslint/no-var-requires
const HtmlWebpackPlugin = require('html-webpack-plugin')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const CopyWebpackPlugin = require('copy-webpack-plugin')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { resolve } = require('path')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const webpack = require('webpack')
// eslint-disable-next-line @typescript-eslint/no-var-requires
require('dotenv').config({ path: './.env' })

module.exports = ({ mode }) => {
	return {
		mode: 'development',
		//entry: './app/demo-app.ts',
		entry: {
			app: { import: './app/demo-app.ts', dependOn: ['codes'] },
			codes: { import: './app/codes.ts' },
			icure: { import: '@icure/cardinal-sdk', dependOn: ['dateFns'] },
			dateFns: 'date-fns',
		},
		plugins: [
			new webpack.DefinePlugin({
				'process.env': JSON.stringify(process.env),
			}),
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
