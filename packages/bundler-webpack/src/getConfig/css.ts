import Config from 'webpack-chain';
import { IConfig, IBundlerConfigType, BundlerConfigType } from '@umijs/types';
// @ts-ignore
import safePostCssParser from 'postcss-safe-parser';
import { deepmerge } from '@umijs/utils';

interface IOpts {
  type: IBundlerConfigType;
  webpackConfig: Config;
  config: IConfig;
  isDev: boolean;
  disableCompress?: boolean;
  browserslist?: any;
  miniCSSExtractPluginPath?: string;
  miniCSSExtractPluginLoaderPath?: string;
}

interface ICreateCSSRuleOpts extends IOpts {
  lang: string;
  test: RegExp;
  loader?: string;
  options?: object;
}

export function createCSSRule({
  webpackConfig,
  type,
  config,
  lang,
  test,
  isDev,
  loader,
  options,
  browserslist,
  miniCSSExtractPluginLoaderPath,
}: ICreateCSSRuleOpts) {
  const rule = webpackConfig.module.rule(lang).test(test);

  applyLoaders(rule.oneOf('css-modules').resourceQuery(/modules/), true);
  applyLoaders(rule.oneOf('css'), false);

  function applyLoaders(rule: Config.Rule<Config.Rule>, isCSSModules: boolean) {
    if (config.styleLoader) {
      rule
        .use('style-loader')
        .loader(require.resolve('style-loader'))
        .options(
          deepmerge(
            {
              base: 0,
            },
            config.styleLoader,
          ),
        );
    } else {
      if (type === BundlerConfigType.csr && !config.styleLoader) {
        rule
          .use('extract-css-loader')
          .loader(
            miniCSSExtractPluginLoaderPath ||
              require('mini-css-extract-plugin').loader,
          )
          .options({
            publicPath: './',
            // https://github.com/umijs/umi/issues/5801
            esModule: false,
            // the hmr option was removed, HMR will work automatically when HotModuleReplacement plugin used or webpack-dev-server with enabled the hot option
            // hmr: isDev,
          });
      }
    }

    if (isDev && isCSSModules && config.cssModulesTypescriptLoader) {
      rule
        .use('css-modules-typescript-loader')
        .loader(require.resolve('css-modules-typescript-loader'))
        .options(config.cssModulesTypescriptLoader);
    }

    rule
      .use('css-loader')
      .loader(require.resolve('css-loader'))
      .options(
        deepmerge(
          {
            importLoaders: 1,
            // https://webpack.js.org/loaders/css-loader/#onlylocals
            ...(type === BundlerConfigType.ssr ? { onlyLocals: true } : {}),
            ...(isCSSModules
              ? {
                  modules: {
                    localIdentName: '[local]___[hash:base64:5]',
                  },
                }
              : {}),
          },
          config.cssLoader || {},
        ),
      );

    rule
      .use('postcss-loader')
      .loader(require.resolve('postcss-loader'))
      .options(
        deepmerge(
          {
            // Necessary for external CSS imports to work
            // https://github.com/facebookincubator/create-react-app/issues/2677
            ident: 'postcss',
            plugins: () => [
              // https://github.com/luisrudge/postcss-flexbugs-fixes
              require('postcss-flexbugs-fixes'),
              // https://github.com/csstools/postcss-preset-env
              require('postcss-preset-env')({
                // TODO: set browsers
                autoprefixer:
                  type === BundlerConfigType.ssr
                    ? false
                    : {
                        ...config.autoprefixer,
                        overrideBrowserslist: browserslist,
                      },
                // https://cssdb.org/
                stage: 3,
              }),
              ...(config.extraPostCSSPlugins ? config.extraPostCSSPlugins : []),
            ],
          },
          config.postcssLoader || {},
        ),
      );

    if (loader) {
      rule
        .use(loader)
        .loader(require.resolve(loader))
        .options(options || {});
    }
  }
}

export default function ({
  type,
  config,
  webpackConfig,
  isDev,
  disableCompress,
  browserslist,
  miniCSSExtractPluginPath,
  miniCSSExtractPluginLoaderPath,
}: IOpts) {
  // css
  createCSSRule({
    type,
    webpackConfig,
    config,
    isDev,
    lang: 'css',
    test: /\.(css)(\?.*)?$/,
    browserslist,
    miniCSSExtractPluginLoaderPath,
  });

  // less
  const theme = config.theme;
  createCSSRule({
    type,
    webpackConfig,
    config,
    isDev,
    lang: 'less',
    test: /\.(less)(\?.*)?$/,
    loader: 'less-loader',
    options: deepmerge(
      {
        modifyVars: theme,
        javascriptEnabled: true,
      },
      config.lessLoader || {},
    ),
    browserslist,
    miniCSSExtractPluginLoaderPath,
  });

  // extract css
  if (!config.styleLoader) {
    const hash = !isDev && config.hash ? '.[contenthash:8]' : '';
    // only csr generator css files
    if (type === BundlerConfigType.csr) {
      webpackConfig
        .plugin('extract-css')
        .use(
          miniCSSExtractPluginPath ||
            require.resolve('mini-css-extract-plugin'),
          [
            {
              filename: `[name]${hash}.css`,
              chunkFilename: `[name]${hash}.chunk.css`,
              ignoreOrder: true,
            },
          ],
        );
    }
  }

  if (!isDev && !disableCompress) {
    webpackConfig
      .plugin('optimize-css')
      .use(require.resolve('optimize-css-assets-webpack-plugin'), [
        {
          cssProcessorOptions: {
            // https://github.com/postcss/postcss-safe-parser
            // TODO: 待验证功能
            parser: safePostCssParser,
          },
          cssProcessorPluginOptions: {
            preset: ['default', config.cssnano],
          },
        },
      ]);
  }
}
