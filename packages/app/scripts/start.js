/* eslint-disable */
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

var express = require('express');
var cors = require('cors');
var chalk = require('chalk');
var webpack = require('webpack');
var WebpackDevServer = require('webpack-dev-server');
var historyApiFallback = require('connect-history-api-fallback');
var execSync = require('child_process').execSync;
var opn = require('opn');
var http = require('http');
var proxy = require('http-proxy-middleware');
var httpProxy = require('http-proxy');
var config = require('../config/webpack.dev');
var paths = require('../config/paths');

// Tools like Cloud9 rely on this.
var DEFAULT_PORT = process.env.PORT || 3000;
var compiler;
var handleCompile;

// Some custom utilities to prettify Webpack output.
// This is a little hacky.
// It would be easier if webpack provided a rich error object.
var friendlySyntaxErrorLabel = 'Syntax error:';
function isLikelyASyntaxError(message) {
  return message.indexOf(friendlySyntaxErrorLabel) !== -1;
}
function formatMessage(message) {
  return (
    message
      // Make some common errors shorter:
      .replace(
        // Babel syntax error
        'Module build failed: SyntaxError:',
        friendlySyntaxErrorLabel
      )
      .replace(
        // Webpack file not found error
        /Module not found: Error: Cannot resolve 'file' or 'directory'/,
        'Module not found:'
      )
      // Internal stacks are generally useless so we strip them
      .replace(/^\s*at\s.*:\d+:\d+[\s\)]*\n/gm, '') // at ... ...:x:y
      // Webpack loader names obscure CSS filenames
      .replace('./~/css-loader!./~/postcss-loader!', '')
  );
}

function clearConsole() {
  // This seems to work best on Windows and other systems.
  // The intention is to clear the output so you can focus on most recent build.
  process.stdout.write('\x1bc');
}

function setupCompiler(port, protocol) {
  // "Compiler" is a low-level interface to Webpack.
  // It lets us listen to some events and provide our own custom messages.
  try {
    compiler = webpack(config, handleCompile);
  } catch (err) {
    console.log(chalk.red('Failed to compile.'));
    console.log();
    console.log(err.message || err);
    console.log();
    process.exit(1);
  }

  // "invalid" event fires when you have changed a file, and Webpack is
  // recompiling a bundle. WebpackDevServer takes care to pause serving the
  // bundle, so if you refresh, it'll wait instead of serving the old one.
  // "invalid" is short for "bundle invalidated", it doesn't imply any errors.
  compiler.hooks.invalid.tap('invalid', function() {
    clearConsole();
    console.log('Compiling...');
  });

  // "done" event fires when Webpack has finished recompiling the bundle.
  // Whether or not you have warnings or errors, you will get this event.
  compiler.hooks.done.tap('done', stats => {
    clearConsole();
    const hasErrors = stats.hasErrors();
    const hasWarnings = stats.hasWarnings();
    if (!hasErrors && !hasWarnings) {
      console.log(chalk.green('Compiled successfully!'));
      console.log();
      console.log('The app is running at:');
      console.log();
      console.log('  ' + chalk.cyan(protocol + '://localhost:' + port + '/'));
      console.log();
      console.log('Note that the development build is not optimized.');
      console.log(
        'To create a production build, use ' + chalk.cyan('npm run build') + '.'
      );
      console.log();
      return;
    }

    // We have switched off the default Webpack output in WebpackDevServer
    // options so we are going to "massage" the warnings and errors and present
    // them in a readable focused way.
    // We use stats.toJson({}, true) to make output more compact and readable:
    // https://github.com/facebookincubator/create-react-app/issues/401#issuecomment-238291901
    var json = stats.toJson({}, true);
    var formattedErrors = json.errors.map(
      message => 'Error in ' + formatMessage(message)
    );
    var formattedWarnings = json.warnings.map(
      message => 'Warning in ' + formatMessage(message)
    );
    if (hasErrors) {
      console.log(chalk.red('Failed to compile.'));
      console.log();
      if (formattedErrors.some(isLikelyASyntaxError)) {
        // If there are any syntax errors, show just them.
        // This prevents a confusing ESLint parsing error
        // preceding a much more useful Babel syntax error.
        formattedErrors = formattedErrors.filter(isLikelyASyntaxError);
      }
      formattedErrors.forEach(message => {
        console.log(message);
        console.log();
      });
      // If errors exist, ignore warnings.
      return;
    }
    if (hasWarnings) {
      console.log(chalk.yellow('Compiled with warnings.'));
      console.log();
      formattedWarnings.forEach(message => {
        console.log(message);
        console.log();
      });
      // Teach some ESLint tricks.
      console.log('You may use special comments to disable some warnings.');
      console.log(
        'Use ' +
          chalk.yellow('// eslint-disable-next-line') +
          ' to ignore the next line.'
      );
      console.log(
        'Use ' +
          chalk.yellow('/* eslint-disable */') +
          ' to ignore all warnings in a file.'
      );
    }
  });
}

function openBrowser(port, protocol) {
  const url = protocol + '://localhost:' + port + '/s';
  if (process.platform === 'darwin') {
    try {
      // Try our best to reuse existing tab
      // on OS X Google Chrome with AppleScript
      execSync('ps cax | grep "Google Chrome"');
      execSync('osascript chrome.applescript ' + url, {
        cwd: path.join(__dirname, 'utils'),
        stdio: 'ignore',
      });
      return;
    } catch (err) {
      // Ignore errors.
    }
  }
  // Fallback to opn
  // (It will always open new tab)
  opn(url);
}

function addMiddleware(devServer, index) {
  devServer.use(function(req, res, next) {
    if (req.url === '/') {
      req.url = '/homepage';
    }
    next();
  });
  devServer.use('/homepage', express.static(paths.homepageSrc));
  devServer.use(
    historyApiFallback({
      // Allow paths with dots in them to be loaded, reference issue #387
      disableDotRule: true,
      // For single page apps, we generally want to fallback to /index.html.
      // However we also want to respect `proxy` for API calls.
      // So if `proxy` is specified, we need to decide which fallback to use.
      // We use a heuristic: if request `accept`s text/html, we pick /index.html.
      // Modern browsers include text/html into `accept` header when navigating.
      // However API calls like `fetch()` won’t generally won’t accept text/html.
      // If this heuristic doesn’t work well for you, don’t use `proxy`.
      htmlAcceptHeaders: ['text/html'],
      index,
      rewrites: [{ from: /\/embed/, to: '/embed.html' }],
    })
  );
  if (process.env.LOCAL_SERVER) {
    devServer.use(
      cors({
        origin: [
          'http://localhost:3000',
          'http://localhost:3002',
          'http://localhost:8000',
          'http://localhost:8001',
        ],
        credentials: true,
      })
    );
    devServer.use(
      '/api',
      proxy({
        target: 'https://codesandbox.io',
        changeOrigin: true,
      })
    );

    // devServer.use(
    //   '/socket.io',
    //   proxy({
    //     target: 'https://sse.codesandbox.io',
    //     changeOrigin: true,
    //     secure: false,
    //   })
    // );
  }
  if (process.env.VSCODE) {
    devServer.use(
      ['/vscode**', '/node_modules**', '/monaco**'],
      proxy({
        target: 'http://localhost:8080',
        changeOrigin: true,
      })
    );
  }
  // Finally, by now we have certainly resolved the URL.
  // It may be /index.html, so let the dev server try serving it again.
  devServer.use(devServer.middleware);
}

function runDevServer(port, protocol, index) {
  var devServer = new WebpackDevServer(compiler, {
    // Enable hot reloading server. It will provide /sockjs-node/ endpoint
    // for the WebpackDevServer client so it can learn when the files were
    // updated. The WebpackDevServer client is included as an entry point
    // in the Webpack development configuration. Note that only changes
    // to CSS are currently hot reloaded. JS changes will refresh the browser.
    hot: true,
    // It is important to tell WebpackDevServer to use the same "root" path
    // as we specified in the config. In development, we always serve from /.
    publicPath: config.output.publicPath,
    // WebpackDevServer is noisy by default so we emit custom message instead
    // by listening to the compiler events with `compiler.hooks[...].tap` calls above.
    quiet: true,
    // Reportedly, this avoids CPU overload on some systems.
    // https://github.com/facebookincubator/create-react-app/issues/293
    watchOptions: {
      ignored: /node_modules/,
    },
    // Enable HTTPS if the HTTPS environment variable is set to 'true'
    https: protocol === 'https',
    // contentBase: paths.staticPath,
    host: process.env.LOCAL_SERVER ? 'localhost' : 'codesandbox.dev',
    disableHostCheck: !process.env.LOCAL_SERVER,
    contentBase: false,
    clientLogLevel: 'warning',
    overlay: true,
    proxy: {
      '/public/vscode-extensions/**': {
        target: `${protocol}://${
          process.env.LOCAL_SERVER ? 'localhost:3000' : 'codesandbox.dev'
        }`,
        bypass: req => {
          if (req.method === 'HEAD') {
            // A hack to support HEAD calls for BrowserFS
            req.method = 'GET';
          }
        },
      },
    },
  });

  // Our custom middleware proxies requests to /index.html or a remote API.
  addMiddleware(devServer, index);

  // Launch WebpackDevServer.
  devServer.listen(port, (err, result) => {
    if (err) {
      return console.log(err);
    }

    clearConsole();
    console.log(chalk.cyan('Starting the development server...'));
    openBrowser(port, protocol);
  });
}

function run(port) {
  var protocol = process.env.HTTPS === 'true' ? 'https' : 'http';
  setupCompiler(port, protocol);
  runDevServer(port, protocol, '/app.html');

  if (process.env.LOCAL_SERVER) {
    const proxy = httpProxy.createProxyServer({});
    http
      .createServer(function(req, res) {
        if (req.url.includes('.js')) {
          proxy.web(req, res, { target: 'http://localhost:3000' });
        } else {
          proxy.web(req, res, {
            target: 'http://localhost:3000/frame.html',
            ignorePath: true,
          });
        }
      })
      .listen(3002);
  }
}

run(DEFAULT_PORT);
