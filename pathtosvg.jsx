/**
 * Ah, JavaScript from 1998... when JS was still a pretty shitty language,
 * syntactically, and things that have simple utility APIs today still
 * required you to write out all the code yourself.
 *
 * Seriously: wtf, Adobe?
 **/

//
// First: functions that do what modern JS already does. We can't
//        even use Array.prototype extension. Badgers.

function forEach(arr, f) {
  for(var i=0, e=arr.length; i<e; i++) {
    f(arr[i], i);
  }
};

function map(arr, f) {
  var a = [];
  for(var i=0, e=arr.length; i<e; i++) {
    a[i] = f(arr[i], i);
  }
  return a;
};

function keys(o) {
  var a = [];
  for (prop in o) {
    if (o.hasOwnProperty(prop)) {
      a.push(prop);
    }
  }
  return a;
};

//
// Also we'll need some custom objects.
//

var Point = function(kind, x, y) {
  this.kind = kind;
  this.x = x;
  this.y = y;
}

Point.prototype = {
  toString: function() {
    var base = [this.kind];
    if (this.in) {
      base = base.concat(['(', this.in.x, this.in.y, ')']);
    }
    base = base.concat([this.x, this.y]);
    if (this.out) {
      base = base.concat(['(', this.out.x, this.out.y, ')']);
    }
    return base.join(' ');
  }
}

var BBox = function() {
  this.mx = 9999999;
  this.my = 9999999;
  this.MX = -9999999;
  this.MY = -9999999;
};

BBox.prototype = {
  grow: function(p) {
    if (!p) return;
    if (p.x < this.mx) { this.mx = p.x; }
    if (p.y < this.my) { this.my = p.y; }
    if (p.x > this.MX) { this.MX = p.x; }
    if (p.y > this.MY) { this.MY = p.y; }
    this.grow(p.in);
    this.grow(p.out);
  }
}

//
// And with that out of the way, the actual script:
//

#target photoshop
var activeDoc = app.activeDocument;

var origUnits = app.preferences.rulerUnits;
app.preferences.rulerUnits = Units.PIXELS;

var types = {
  'PointKind.CORNERPOINT': 'P',
  'PointKind.SMOOTHPOINT': 'C'
};

// filewrite function
function writeToFile(data) {
  var path = app.activeDocument.path || 'C:';
  var dir = Folder(path);
  var file = dir.saveDlg('', '.svg', true);
  if (!file) return false;

  var mode = 'w';
  file.open(mode);
  file.write(data);
  file.close(mode);
  return file.toString();
}

// convert a PathPoint to a real object.
function improvePoint(point) {
  var kind = types[point.kind];
  var coord = point.anchor;
  var x = Math.round(coord[0]);
  var y = Math.round(coord[1]);

  var obj = new Point(kind,x,y);

  if (kind==='C') {
    var d, dx, dy;
    if (point.leftDirection) {
      d = map(point.leftDirection, Math.round);
      obj.out = { x:d[0], y:d[1] };
    }
    if (point.rightDirection) {
      d = map(point.rightDirection, Math.round);
      obj.in = { x:d[0], y:d[1] };
    }
  }

  return obj;
}

// convert all points in a subpath to easier to parse form
function handleSubPath(subpath) {
  return map(subpath.pathPoints, improvePoint);
};

// convert all subpaths in a path to easier to walk form
function handlePath(path) {
  return map(path.subPathItems, handleSubPath);
};

// convert all paths in a document to easier to walk form.
function convertPaths(pathItems) {
  return map(pathItems, handlePath);
}

// turn a subpath of improved points into an SVG path
function formSVGpath(subpath, bbox) {
  var p0 = subpath[0];
  var path = ['M', p0.x, p0.y];
  // we want to close this path:
  subpath.push(p0);
  forEach(subpath, function(p, i) {
    if (i===0) return;
    bbox.grow(p);

    if (p0.kind === 'P' && p.kind === 'P') {
      path = path.concat(['L', p.x, p.y]);
    }
    else if (p0.kind === 'P' && p.kind === 'C') {
      path = path.concat(['C', p0.x, p0.y, p.in.x, p.in.y, p.x, p.y]);
    }
    else if (p0.kind === 'C' && p.kind === 'P') {
      path = path.concat(['C', p0.out.x, p0.out.y, p.x, p.y, p.x, p.y]);
    }
    else if (p0.kind === 'C' && p.kind === 'C') {
      path = path.concat(['C', p0.out.x, p0.out.y, p.in.x, p.in.y, p.x, p.y]);
    }
    p0 = p;
  });
  path.push('z');
  return path.join(' ');
}

// Convert an improved path into an SVG string
function formPathCollectionSVG(pathCollection) {
  var svg = [];
  var bbox = new BBox();
  forEach(pathCollection, function(path) {
    var d = '';
    forEach(path, function(subpath) {
      d += formSVGpath(subpath, bbox);
    });
    svg.push('<path fill="black" stroke="black" d="' + d + '"/>');
  });
  svg.push('</svg>');
  var w = bbox.MX - bbox.mx;
  var h = bbox.MY - bbox.my;
  var header = '<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+w+'" viewBox="'+[bbox.mx,bbox.my,w,h].join(' ')+'">';
  svg = [header].concat(svg);
  return svg.join('\n');;
}

var improved = convertPaths(activeDoc.pathItems);
var svg = formPathCollectionSVG(improved);
var filepath = writeToFile(svg);
if (!!filepath) {
  alert("svg saved to " + filepath);
}
app.preferences.rulerUnits = origUnits;
