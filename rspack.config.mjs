import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { rspack } from '@rspack/core'
import dotenv from 'dotenv'
import * as sass from 'sass'

const __dirname = dirname(fileURLToPath(import.meta.url))

const env = dotenv.config()
const defineValues = {}
if (env.parsed) {
	for (const [key, value] of Object.entries(env.parsed)) {
		defineValues[`process.env.${key}`] = JSON.stringify(value)
	}
}

/** @type {import('@rspack/core').Configuration} */
export default {
	mode: 'development',
	entry: {
		app: { import: './app/demo-app.ts', dependOn: ['codes'] },
		codes: { import: './app/codes.ts' },
		icure: { import: '@icure/cardinal-sdk', dependOn: ['dateFns'] },
		dateFns: 'date-fns',
	},
	plugins: [
		new rspack.DefinePlugin(defineValues),
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
								decoratorMetadata: false,
								useDefineForClassFields: false,
							},
						},
					},
				},
				exclude: /node_modules/,
			},
			{
				test: /\.yaml$/,
				type: 'asset/source',
			},
			{
				test: /\.s([ca])ss$/,
				use: [
					{
						loader: resolve(__dirname, 'lit-css-loader.cjs'),
					},
					{
						loader: 'sass-loader',
					},
				],
			},
			{
				test: /\.css$/,
				type: 'css',
				use: [
					{
						loader: resolve(__dirname, 'lit-css-loader.cjs'),
					},
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
	devServer: {
		hot: true,
	},
}
