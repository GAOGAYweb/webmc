// Generated by CoffeeScript 1.6.3
(function() {
  var ClientMC, decodePacket, ever, minecraft_protocol, onesInShort, websocket_stream, zlib;

  websocket_stream = require('websocket-stream');

  minecraft_protocol = require('minecraft-protocol');

  ever = require('ever');

  zlib = require('zlib-browserify');

  module.exports = function(game, opts) {
    return new ClientMC(game, opts);
  };

  decodePacket = function(data) {
    var buffer, id, name, payload, result;
    if (!(data instanceof Uint8Array)) {
      return void 0;
    }
    data._isBuffer = true;
    buffer = new Buffer(data);
    result = minecraft_protocol.protocol.parsePacket(buffer);
    if (!result || result.error) {
      console.log('protocol parse error: ' + JSON.stringify(result.error));
      return void 0;
    }
    payload = result.results.data;
    id = result.results.id;
    name = minecraft_protocol.protocol.packetNames[minecraft_protocol.protocol.states.PLAY].toClient[id];
    return {
      name: name,
      id: id,
      payload: payload
    };
  };

  onesInShort = function(n) {
    var count, i, _i;
    n = n & 0xffff;
    count = 0;
    for (i = _i = 0; _i <= 16; i = ++_i) {
      count += +((1 << i) & n);
    }
    return count;
  };

  ClientMC = (function() {
    function ClientMC(game, opts) {
      var _base;
      this.game = game;
      this.opts = opts;
      if ((_base = this.opts).url == null) {
        _base.url = 'ws://localhost:1234';
      }
      this.enable();
    }

    ClientMC.prototype.enable = function() {
      var _ref,
        _this = this;
      if ((_ref = this.game.plugins) != null) {
        _ref.disable('voxel-land');
      }
      this.ws = websocket_stream(this.opts.url, {
        type: Uint8Array
      });
      this.game.voxels.on('missingChunk', this.missingChunk.bind(this));
      this.columns = {};
      this.ws.on('error', function(err) {
        return console.log('WebSocket error', err);
      });
      return this.ws.on('data', function(data) {
        var packet;
        packet = decodePacket(data);
        if (packet == null) {
          return;
        }
        return _this.handlePacket(packet.name, packet.payload);
      });
    };

    ClientMC.prototype.disable = function() {
      this.game.voxels.removeListener('missingChunk', this.missingChunk);
      return this.ws.end();
    };

    ClientMC.prototype.handlePacket = function(name, payload) {
      var compressed,
        _this = this;
      if (name === 'map_chunk_bulk') {
        console.log(payload);
        compressed = payload.compressedChunkData;
        console.log('map_chunk_bulk', compressed.length);
        console.log('payload.meta', payload);
        if (payload.meta == null) {
          return;
        }
        return zlib.inflate(compressed, function(err, inflated) {
          var i, meta, offset, size, _i, _len, _ref, _results;
          if (err) {
            return err;
          }
          console.log('  decomp', inflated.length);
          offset = meta = size = 0;
          _ref = payload.meta;
          _results = [];
          for (i = _i = 0, _len = _ref.length; _i < _len; i = ++_i) {
            meta = _ref[i];
            size = (8192 + (payload.skyLightSent ? 2048 : 0)) * onesInShort(meta.bitMap) + 2048 * onesInShort(meta.addBitMap) + 256;
            _this.addColumn({
              x: meta.x,
              z: meta.z,
              bitMap: meta.bitMap,
              addBitMap: meta.addBitMap,
              skyLightSent: payload.skyLightSent,
              groundUp: true,
              data: inflated.slice(offset, offset + size)
            });
            _results.push(offset += size);
          }
          return _results;
        });
      }
    };

    ClientMC.prototype.addColumn = function(args) {
      var column, offset, size, y, _i;
      console.log('add column', args);
      column = [];
      offset = 0;
      size = 4096;
      for (y = _i = 0; _i <= 16; y = ++_i) {
        if (args.bitMap & (1 << y)) {
          column[y] = args.data.slice(offset, offset + size);
          offset += size;
        } else {
          column[y] = null;
        }
      }
      this.columns[args.x + '|' + args.z] = column;
      return window.c = this.columns;
    };

    ClientMC.prototype.missingChunk = function(pos) {
      var chunk, chunkXZ, chunkY, i, voxels, _i, _ref;
      console.log('missingChunk', pos);
      chunkXZ = Object.keys(this.columns)[0];
      chunkY = 0;
      if (this.columns[chunkXZ] == null) {
        console.log('no chunkXZ ', chunkXZ);
        return;
      }
      voxels = this.columns[chunkXZ][chunkY];
      for (i = _i = 0, _ref = voxels.length; 0 <= _ref ? _i < _ref : _i > _ref; i = 0 <= _ref ? ++_i : --_i) {
        voxels[i] = voxels[i] & 15;
      }
      chunk = {
        position: pos,
        dims: [16, 16, 16],
        voxels: voxels
      };
      this.game.showChunk(chunk);
      return console.log('voxels', voxels);
    };

    return ClientMC;

  })();

}).call(this);