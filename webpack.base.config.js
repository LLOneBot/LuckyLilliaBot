// import path from "path";
const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = {
    // target: 'node',
    entry: {
        // main: './src/main.ts',
        // preload: './src/preload.ts'
    }, // 入口文件路径
    target: "node",
    output: { // 输出文件配置
        path: path.resolve(__dirname, 'dist'), // 输出目录路径
        filename: '[name].js', // 输出文件名
        // libraryTarget: "commonjs2",
        // chunkFormat: "commonjs",
    },
    externals: [
        // "express",
        "electron", "fs"],
    experiments: {
        // outputModule: true
    },
    resolve: {
        extensions: ['.js', '.ts']
    },
    module: { // 模块配置
        rules: [ // 模块规则
            {
                test: /\.js$/, // 匹配.js文件
                exclude: /node_modules/, // 排除node_modules目录
                use: { // 使用的loader
                    loader: 'babel-loader',
                    options: {
                        presets: ['@babel/preset-env'],

                    }
                }
            },
            {
                test: /\.ts$/, // 匹配.ts文件
                // exclude: /node_modules/, // 排除node_modules目录
                use: { // 使用的loader
                    loader: 'ts-loader',
                    options: {
                        // configFile: 'src/tsconfig.json'
                    }
                }
            }
        ]
    },
    optimization: {
        minimize: false,
        minimizer: [
            new TerserPlugin({
                extractComments: false,
            }),
        ],
    }
}