const fs = require('fs');
const config = JSON.parse(fs.readFileSync('./config.js', 'utf8'));
const uglify = require('uglify-js');

exports.recompressStaticAssets = (winston) => {
  if (config.recompressStaticAssets == false) return false;  
  var list = fs.readdirSync(process.cwd() + '/static');
  for (var j = 0; j < list.length; j++) {
    var item = list[j];
    if ((item.indexOf('.js') === item.length - 3) && (item.indexOf('.min.js') === -1)) {
      var dest = item.substring(0, item.length - 3) + '.min' + item.substring(item.length - 3);
      var orig_code = fs.readFileSync(process.cwd() + '/static/' + item, 'utf8');

      fs.writeFileSync(process.cwd() + '/static/' + dest, uglify.minify(orig_code).code, 'utf8');
      winston.info('compressed ' + item + ' into ' + dest);
    }
  }

};