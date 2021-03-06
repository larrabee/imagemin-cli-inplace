#!/usr/bin/env node
'use strict';
const fs = require('fs');
const arrify = require('arrify');
const meow = require('meow');
const getStdin = require('get-stdin');
const imagemin = require('imagemin');
const ora = require('ora');
const plur = require('plur');
const stripIndent = require('strip-indent');
const imageminMozjpeg = require('imagemin-mozjpeg');
const imageminPngquant = require('imagemin-pngquant');
const imageminSvgo = require('imagemin-svgo');
const imageminGiflossy = require('imagemin-giflossy');

const cli = meow(`
	Usage
	  $ imagemin <path|glob> ... --out-dir=build [--plugin=<name> ...]
	  $ imagemin <file> > <output>
	  $ cat <file> | imagemin > <output>

	Options
	  -p, --plugin   Override the default plugins
	  -o, --out-dir  Output directory
	  --overwrite    Overwrite the original file with a minified version

	Examples
	  $ imagemin images/* --out-dir=build
	  $ imagemin foo.png > foo-optimized.png
	  $ cat foo.png | imagemin > foo-optimized.png
	  $ imagemin --plugin=pngquant foo.png > foo-optimized.png
	  $ imagemin --overwrite foo.png
`, {
	string: [
		'plugin',
		'out-dir'
	],
	boolean: [
		'overwrite'
	],
	alias: {
		p: 'plugin',
		o: 'out-dir'
	}
});

const DEFAULT_PLUGINS = [
	'gifsicle',
	'jpegtran',
	'optipng',
	'svgo'
];

const requirePlugins = plugins => plugins.map(x => {
	try {
		return require(`imagemin-${x}`)();
	} catch (err) {
		console.error(stripIndent(`
			Unknown plugin: ${x}

			Did you forgot to install the plugin?
			You can install it with:

			  $ npm install -g imagemin-${x}
		`).trim());
		process.exit(1);
	}
});

const run = (input, opts) => {
	opts = Object.assign({plugin: DEFAULT_PLUGINS}, opts);

	const use = requirePlugins(arrify(opts.plugin));
	const spinner = ora('Minifying images');

	if (Buffer.isBuffer(input)) {
		imagemin.buffer(input, {use}).then(buf => process.stdout.write(buf));
		return;
	}

	if (opts.outDir) {
		spinner.start();
	}

	imagemin(input, opts.outDir, {use})
		.then(files => {
			if (!opts.outDir && files.length === 0) {
				return;
			}

			if (!opts.outDir && files.length > 1) {
				console.error('Cannot write multiple files to stdout, specify a `--out-dir`');
				process.exit(1);
			}

			if (!opts.outDir) {
				process.stdout.write(files[0].data);
				return;
			}

			spinner.stop();

			console.log(`${files.length} ${plur('image', files.length)} minified`);
		})
		.catch(err => {
			spinner.stop();
			throw err;
		});
};

const runOverwrite = (input, opts) => {
	opts = Object.assign({plugin: DEFAULT_PLUGINS}, opts);
	const use = requirePlugins(arrify(opts.plugin));
	input.forEach(file => {
		const origFile = fs.readFileSync(file);
		imagemin.buffer(origFile, {plugins: [
                                          imageminMozjpeg({quality: 85}),
                                          imageminPngquant({quality: "60-85"}	),
																					imageminSvgo(),
																					imageminGiflossy({lossy: 50})
                                        ]
                    })
			.then(buff => {
				fs.writeFile(file, buff, err => {
					if (err) {
						throw err;
					}
				});
			})
			.catch(err => {
				throw err;
			});
	});
};

if ((cli.input.length === 0 && process.stdin.isTTY) || (cli.input.length === 0 && cli.flags.overwrite)) {
	console.error('Specify at least one filename');
	process.exit(1);
}

if (cli.flags.overwrite) {
	runOverwrite(cli.input, cli.flags);
} else if (cli.input.length > 0) {
	run(cli.input, cli.flags);
} else {
	getStdin.buffer().then(buf => run(buf, cli.flags));
}
