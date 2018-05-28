const fs = require('fs');

const MAGIC = "\xda\x1ameta";
const MAGIC_LEN  = 6;
const MAJOR_VERSION = 1;
const MINOR_VERSION = 0;

let toRealString = (b) => {return b.toString()};
let toByte = (b) => {return b.readUInt8()};
let toUInt32 = (b) => {return b.readUInt32BE()};
let toUInt64 = (b) => {return b.readDoubleBE()};

let dirEntry = () => {
  return {
    name: undefined,
    children: undefined,
    metadata: undefined,
    lastChanged: undefined,
    path: '',
    parser: [
      { count: 4, tag: 'name', t: toUInt32 },
      { count: 4, tag: 'children', t: toUInt32 },
      { count: 4, tag: 'metadata', t: toUInt32 },
      { count: 4, tag: 'lastChanged', t: toUInt32 },
    ]
  };
};

let attributeEntry = () => {
  return {
    attrCount: 0,
    parser: [
      { count: 4, tag: 'attrCount', t: toUInt32 }
    ]
  };
}

let childrenDirEntry = () => {
  return {
    numChildren: 0,
    children: undefined,
    parser: [
      { count: 4, tag: 'numChildren', t: toUInt32 },
      { count: 16, tag: 'children', t: (b) => { return b }}
    ]
  };
}

let headerEntry = () => {
  return {
    magic: undefined,
    major: undefined,
    minor: undefined,
    rotated: undefined,
    randomTag: undefined,
    root: undefined,
    attributes: undefined,
    timestamp: undefined,
    parser: [
      { count: 6, tag: 'magic', t: toRealString },
      { count: 1, tag: 'major', t: toByte },
      { count: 1, tag: 'minor', t: toByte },
      { count: 4, tag: 'rotated', t: toUInt32 },
      { count: 4, tag: 'randomTag', t: toUInt32 },
      { count: 4, tag: 'root', t: toUInt32 },
      { count: 4, tag: 'attributes', t: toUInt32 },
      { count: 8, tag: 'timestamp', t: toUInt64 }
    ]
  };
};

let metadataEntry = () => {
  return {
      key: undefined,
      value: undefined,
      parser: [
        { count: 4, tag: 'key', t: toUInt32 },
        { count: 4, tag: 'value', t: toUInt32 }
      ]
  };
};

let metadataKeyEntry = () => {
  return {
    numKeys: 0,
    keys: undefined,
    parser: [
      { count: 4, tag: 'numKeys', t: toUInt32 },
      { count: 8, tag: 'keys', t: (b) => { return b }}
    ]
  };
}

let parser = (filepath) => new Promise((resolve,reject) => {
  fs.readFile(filepath, (err,data) => {
    if (err) {
      return reject('Cannot open file');
    }

    let entries = {};

    let readChunk = (object, offset) => {

      if (offset > data.length) {
        return false;
      }

      let _offset = offset;
      for (let i of object.parser) {
        limit = _offset + i.count;
        if (object.hasOwnProperty(i.tag)) {

          if (_offset > data.length || limit > data.length) {
            return false;
          }

          object[i.tag] = data.slice(_offset, limit);
          object[i.tag] = i.t(object[i.tag]);
        }

        _offset += i.count;
      }

      delete object.parser;

      return true;
    };

    let lastStringPos = 0;

    let readString = (start) => {
      let pos = start;
      while (data[pos] != 0) {
        pos++;
      }

      lastStringPos = pos;

      return data.slice(start,pos).toString();
    };

    let readString2 = (start) => {
      let pos = start;
      while (data[pos] != 0) {
        pos++;
      }

      lastStringPos = pos;
      console.log('s ' + start + ' p ' + pos);
      return data.slice(start,pos);
    };

    let convertString = (b) => { let n = toUInt32(b); return readString(n); };

    let header = headerEntry();
    readChunk(header,0);

    if (header.magic.length != MAGIC_LEN) {
      return reject('wrong file');
    }

    let attrs = attributeEntry();
    readChunk(attrs,header.attributes);

    let realAttrs = [];
    for (let i = 0; i < attrs.attrCount; i++) {
      let p = attributeEntry();
      readChunk(p,header.attributes+4 + 4*i);
      realAttrs.push(readString(p.attrCount));
    }

    header.attributes = realAttrs;

    let traverse = (start, pathParent) => {

      let parent = dirEntry();
      parent.parser[0].t = convertString;
      readChunk(parent,start);

      parent.path = pathParent + parent.name;

      let children = childrenDirEntry();
      readChunk(children,parent.children);

      let metadata = metadataKeyEntry();
      readChunk(metadata,parent.metadata);

      let keys = [];
      for (let i = 0; i < metadata.numKeys; i++) {
        let metaEntry = metadataEntry();
        metaEntry.parser[1].t = convertString;
        readChunk(metaEntry,parent.metadata+4 + 8*i);
        metaEntry.key = header.attributes[metaEntry.key];
        keys.push({ [metaEntry.key]: metaEntry.value });
      }

      parent.metadata = keys;

      if (parent.metadata.length > 0) {
        entries = Object.assign({},entries, { [parent.path]: parent.metadata });
      }

      if (pathParent != '' && children.numChildren > 0) {
        parent.path = parent.path + '/';
      }

      let realChildren = [];
      for (let i = 0; i < children.numChildren; i++) {
        let child = traverse(parent.children+4 + 16*i,parent.path);
        realChildren.push(child);
      }

      parent.children = realChildren;

      return parent;
    };

    header.root = traverse(header.root,'');

    resolve({file:header,entries:entries});
  });
});

module.exports = parser;
