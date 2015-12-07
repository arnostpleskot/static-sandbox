import gulp                 from 'gulp';
import plumber              from 'gulp-plumber';
import sass                 from 'gulp-sass';
import sourcemaps           from 'gulp-sourcemaps';
import prefix               from 'gulp-autoprefixer';
import imagemin             from 'gulp-imagemin';
import spritesmith          from 'gulp.spritesmith';
import svgSymbols           from 'gulp-svg-symbols';
import rename               from 'gulp-rename';
import del                  from 'del';
import os                   from 'os';
import htmlreplace          from 'gulp-html-replace';
import pngquant             from 'imagemin-pngquant';
import makeWebpackConfig    from './webpack/makeconfig';
import webpackBuild         from './webpack/build';
import webpackDevServer     from './webpack/devserver';
import yargs                from 'yargs';
import runSequence          from 'run-sequence';
import jade                 from 'gulp-jade';
import config               from './config';

const browserSync = require('browser-sync').create();
const reload = browserSync.reload;

const args = yargs
  .alias('s', 'sync')
  .argv;

// because of multiple extensions possibility [sass,scss]
const getCssSrcArray = () => {
  let retArr = [];

  config.mainCssFiles.map((cssFile) => {
    config.cssPreprocessor.map((preprocessor) => {
      retArr.push(`${config.assetsPath}${config.cssFolder}/${cssFile}.${preprocessor}`);
    });
  });

  return retArr;
}

gulp.task('browser-sync', () => {
    browserSync.init({
      server: {
        baseDir: `./${config.outputPath}`,
        index: `${config.staticTemplatesFolder}/index.html`
      }
    });
});

// clean image folder
gulp.task('cleanup', () => {
  return del([`${config.outputPath}${config.imageFolder}`]);
})

// development css
gulp.task('css-dev', () => {
  const cssFilesArray = getCssSrcArray();

  return gulp.src(cssFilesArray)
    .pipe(sourcemaps.init())
    .pipe(sass().on('error', sass.logError))
    .pipe(prefix())
    .pipe(sourcemaps.write())
    .pipe(gulp.dest(`${config.outputPath}css`))
    .pipe(browserSync.stream());
});

// production css
gulp.task('css-prod', () => {
  const cssFilesArray = getCssSrcArray();

  return gulp.src(cssFilesArray)
    .pipe(sass({outputStyle: 'compressed'}))
    .pipe(prefix('last 10 versions', '> 1%', 'Firefox >= 10'))
    .pipe(gulp.dest(`${config.outputPath}css`));
});

// png sprite
gulp.task('img-sprite', () => {
  var spriteData = gulp.src(`${config.assetsPath}${config.imageFolder}/${config.spritesFolder}/*.png`)
    .pipe(spritesmith({
        imgName: 'sprite.png',
        cssName: 'img-sprite.sass',
        algorithm: 'binary-tree',
        imgPath: '../' + config.imageFolder + '/sprite.png?v=' + Date.now(),
        padding: 10
    }));

  spriteData.img
      .pipe(gulp.dest(`${config.assetsPath}${config.imageFolder}`));

  spriteData.css
      .pipe(gulp.dest(`${config.assetsPath}${config.cssFolder}`));

  return spriteData;
});

// svg sprite
gulp.task('svg-sprite', () => {
  return gulp.src(`${config.assetsPath}${config.imageFolder}/${config.svgFolder}/*.svg`)
          .pipe(svgSymbols({
            className:  '.icon--%f',
            title: false
          }))
          .pipe(rename((path) => {
            path.dirname = './'
            path.dirname += (path.extname === '.svg') ? config.imageFolder : config.cssFolder
            path.basename = (path.extname === '.svg') ? 'sprite' : 'svg-symbols'
            path.extname = (path.extname === '.svg') ? '.svg' : '.scss'
          }))
          .pipe(gulp.dest(config.assetsPath));
});

// copy images to outputPath and optimize them
gulp.task('img-optimize', ['cleanup', 'img-sprite', 'svg-sprite'], () => {
  return gulp.src([`${config.assetsPath}${config.imageFolder}/**/*`,
                    `!${config.assetsPath}${config.imageFolder}/${config.spritesFolder}/`,
                    `!${config.assetsPath}${config.imageFolder}/${config.spritesFolder}/*`,
                    `!${config.assetsPath}${config.imageFolder}/${config.svgFolder}/`,
                    `!${config.assetsPath}${config.imageFolder}/${config.svgFolder}/*`])
    .pipe(imagemin({
        progressive: true,
        use: [pngquant()]
    }))
    .pipe(gulp.dest(`${config.outputPath}${config.imageFolder}`));
});

// get local ip
var _ip = null;
gulp.task('local-ip', () => {
  var ifaces = os.networkInterfaces();
  for (var dev in ifaces) {
    if(dev != "en1" && dev != "en0") {
      continue;
    }
    ifaces[dev].forEach((details) => {
      if (details.family=='IPv4') {
        _ip = details.address;
      }
    });
  };
});

// set js path
gulp.task('js-path', () => {
  var host = _ip !== null ? 'http://' + _ip + ':' + config.localPort : '';
  var scripts = [];
  config.mainJsFiles.map((file, index) => {
    scripts.push(host + '/js/' + file + '.js?v=' + new Date().getTime() );
  });

  gulp.src(['src/**/*.twig', 
            `${config.assetsPath}jade/*.jade`,
            `${config.outputPath}${config.staticTemplatesFolder}/**/*.html`], 
            { base: './' })

        .pipe(htmlreplace(
          { js: scripts },
          {
            keepBlockTags: true,
            resolvePaths: false
          }
        ))
        .pipe(gulp.dest('.'));
});

const jadeVars = {};
gulp.task('jade', () => {
  gulp.src([`${config.assetsPath}jade/**/*.jade`])
    .pipe(plumber())
    .pipe(jade({
      locals: jadeVars,
      pretty: true
    }))
    .pipe(gulp.dest(`${config.outputPath}${config.staticTemplatesFolder}`));
});

// just function triggers
gulp.task('images', ['img-optimize']);
gulp.task('webpack-prod', webpackBuild(makeWebpackConfig(false)));
gulp.task('webpack-dev', webpackDevServer(makeWebpackConfig(true)));

gulp.task('default', ['local-ip', 'js-path', 'jade', 'images', 'css-dev', 'webpack-dev'], () => {
  if( args.sync ) {
    runSequence(['browser-sync']);
    gulp.watch(`${config.outputPath}${config.staticTemplatesFolder}/**/*.html`).on('change', reload);
  }

  // watch css
  gulp.watch(`${config.assetsPath}${config.cssFolder}/**/*.{${config.cssPreprocessor.join(',')}}`, ['css-dev']);

  // watch jade
  gulp.watch([`${config.assetsPath}jade/**/*.jade`]).on('change', (file) => {
    if( file.type !== 'deleted' ) {
      gulp
        .src(file.path)
        .pipe(plumber())
        .pipe(jade({
          locals: jadeVars,
          pretty: true
        }))
        .pipe( gulp.dest(`${config.outputPath}${config.staticTemplatesFolder}`) );
    } else {
      const fileParts = file.path.split('/');
      const fileName = fileParts[fileParts.length - 1].replace('jade', 'html');
      del([file.path, `${config.outputPath}${config.staticTemplatesFolder}/${fileName}`]);
    }
  });
  
  // watch png sprites
  gulp.watch([`${config.assetsPath}${config.imageFolder}/${config.spritesFolder}/*`]).on('change', () => {
    runSequence(['img-sprite']);
  });

  // watch svg sprites
  gulp.watch([`${config.assetsPath}${config.imageFolder}/${config.svgFolder}/*`]).on('change', () => {
    runSequence(['svg-sprite']);
  });
  
  // watch all other images, except for generated sprite.png, sprite.svg and sprites/svg folders
  gulp.watch([`${config.assetsPath}${config.imageFolder}/**/*.{jpg,jpeg,png,gif,svg}`, 
              `!${config.assetsPath}${config.imageFolder}/sprite.png`,
              `!${config.assetsPath}${config.imageFolder}/sprite.svg`,
              `!${config.assetsPath}${config.imageFolder}/${config.spritesFolder}/`,
              `!${config.assetsPath}${config.imageFolder}/${config.spritesFolder}/*`,
              `!${config.assetsPath}${config.imageFolder}/${config.svgFolder}/`,
              `!${config.assetsPath}${config.imageFolder}/${config.svgFolder}/*`])
            .on('change', (file) => {
              if(file.type !== 'deleted') {
                gulp
                  .src(file.path)
                  .pipe(imagemin({
                      progressive: true,
                      use: [pngquant()]
                  }))
                  .pipe( gulp.dest(`${config.outputPath}${config.imageFolder}`) );
              }
            });
});

gulp.task('build', ['js-path', 'jade', 'images', 'css-prod', 'webpack-prod'])



